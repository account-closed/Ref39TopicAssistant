//! Tantivy-based search index module.
//!
//! Provides full-text search capabilities for topics with field boosting.

use std::path::Path;
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::query::{BooleanQuery, BoostQuery, Occur, QueryParser};
use tantivy::schema::{Field, Schema, Value, STORED, TEXT};
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument};
use tokio::sync::RwLock;

use crate::errors::AppError;
use crate::models::{Tag, Topic};

/// Field boost values matching frontend weights.
const BOOST_HEADER: f32 = 10.0;
const BOOST_KEYWORDS: f32 = 8.5;
const BOOST_DESCRIPTION: f32 = 7.0;
const BOOST_NOTES: f32 = 5.5;
const BOOST_TAG_NAMES: f32 = 4.0;
const BOOST_TAG_KEYWORDS: f32 = 2.5;

/// Search result with topic and relevance score.
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub topic_id: String,
    pub score: f32,
}

/// Search index schema fields.
struct SearchFields {
    topic_id: Field,
    header: Field,
    description: Field,
    notes: Field,
    keywords: Field,
    tag_names: Field,
    tag_keywords: Field,
}

/// Tantivy search index for topics.
pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    writer: Arc<RwLock<IndexWriter>>,
    fields: SearchFields,
}

impl SearchIndex {
    /// Create or open a search index at the specified path.
    pub fn open(index_path: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(index_path)
            .map_err(|e| AppError::Search(format!("Failed to create index directory: {}", e)))?;

        // Define schema
        let mut schema_builder = Schema::builder();
        let topic_id = schema_builder.add_text_field("topic_id", STORED);
        let header = schema_builder.add_text_field("header", TEXT | STORED);
        let description = schema_builder.add_text_field("description", TEXT);
        let notes = schema_builder.add_text_field("notes", TEXT);
        let keywords = schema_builder.add_text_field("keywords", TEXT);
        let tag_names = schema_builder.add_text_field("tag_names", TEXT);
        let tag_keywords = schema_builder.add_text_field("tag_keywords", TEXT);
        let schema = schema_builder.build();

        let fields = SearchFields {
            topic_id,
            header,
            description,
            notes,
            keywords,
            tag_names,
            tag_keywords,
        };

        // Try to open existing index or create new one
        let index = Index::open_in_dir(index_path)
            .or_else(|_| Index::create_in_dir(index_path, schema.clone()))
            .map_err(|e| AppError::Search(format!("Failed to open/create index: {}", e)))?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| AppError::Search(format!("Failed to create reader: {}", e)))?;

        let writer = index
            .writer(50_000_000) // 50MB buffer
            .map_err(|e| AppError::Search(format!("Failed to create writer: {}", e)))?;

        Ok(Self {
            index,
            reader,
            writer: Arc::new(RwLock::new(writer)),
            fields,
        })
    }

    /// Rebuild the entire index from topics.
    pub async fn rebuild(&self, topics: &[Topic], tags: &[Tag]) -> Result<(), AppError> {
        let mut writer = self.writer.write().await;

        // Clear existing index
        writer.delete_all_documents()?;

        // Index all topics
        for topic in topics {
            let doc = self.create_document(topic, tags);
            writer.add_document(doc)?;
        }

        writer.commit()?;

        // Reload reader to see new documents
        self.reader.reload()?;

        tracing::info!("Search index rebuilt with {} topics", topics.len());
        Ok(())
    }

    /// Index a single topic.
    pub async fn index_topic(&self, topic: &Topic, tags: &[Tag]) -> Result<(), AppError> {
        let mut writer = self.writer.write().await;

        // Delete existing document if any
        let term = tantivy::Term::from_field_text(self.fields.topic_id, &topic.id);
        writer.delete_term(term);

        // Add new document
        let doc = self.create_document(topic, tags);
        writer.add_document(doc)?;
        writer.commit()?;

        // Reload reader
        self.reader.reload()?;

        Ok(())
    }

    /// Remove a topic from the index.
    pub async fn remove_topic(&self, topic_id: &str) -> Result<(), AppError> {
        let mut writer = self.writer.write().await;

        let term = tantivy::Term::from_field_text(self.fields.topic_id, topic_id);
        writer.delete_term(term);
        writer.commit()?;

        self.reader.reload()?;

        Ok(())
    }

    /// Search for topics matching the query.
    pub fn search(
        &self,
        query_str: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<SearchResult>, AppError> {
        if query_str.trim().is_empty() {
            return Ok(Vec::new());
        }

        let searcher = self.reader.searcher();

        // Create query parser for all searchable fields
        let query_parser = QueryParser::for_index(
            &self.index,
            vec![
                self.fields.header,
                self.fields.description,
                self.fields.notes,
                self.fields.keywords,
                self.fields.tag_names,
                self.fields.tag_keywords,
            ],
        );

        // Parse the user query
        let base_query = query_parser
            .parse_query(query_str)
            .map_err(|e| AppError::Search(format!("Invalid search query: {}", e)))?;

        // Create field-specific boosted queries
        let mut subqueries: Vec<(Occur, Box<dyn tantivy::query::Query>)> = Vec::new();

        // Parse query for each field with boost
        let field_queries = [
            (self.fields.header, BOOST_HEADER),
            (self.fields.keywords, BOOST_KEYWORDS),
            (self.fields.description, BOOST_DESCRIPTION),
            (self.fields.notes, BOOST_NOTES),
            (self.fields.tag_names, BOOST_TAG_NAMES),
            (self.fields.tag_keywords, BOOST_TAG_KEYWORDS),
        ];

        for (field, boost) in field_queries {
            let field_parser = QueryParser::for_index(&self.index, vec![field]);
            if let Ok(field_query) = field_parser.parse_query(query_str) {
                let boosted = BoostQuery::new(field_query, boost);
                subqueries.push((Occur::Should, Box::new(boosted)));
            }
        }

        // Combine with OR semantics
        let combined_query = if subqueries.is_empty() {
            base_query
        } else {
            Box::new(BooleanQuery::new(subqueries))
        };

        // Execute search with pagination
        let top_docs = searcher
            .search(&combined_query, &TopDocs::with_limit(limit + offset))
            .map_err(|e| AppError::Search(format!("Search failed: {}", e)))?;

        // Extract results with pagination
        let results: Vec<SearchResult> = top_docs
            .into_iter()
            .skip(offset)
            .take(limit)
            .filter_map(|(score, doc_address)| {
                let doc: TantivyDocument = searcher.doc(doc_address).ok()?;
                let topic_id = doc.get_first(self.fields.topic_id)?.as_str()?.to_string();
                Some(SearchResult { topic_id, score })
            })
            .collect();

        Ok(results)
    }

    /// Create a Tantivy document from a topic.
    fn create_document(&self, topic: &Topic, tags: &[Tag]) -> TantivyDocument {
        // Collect tag names and keywords for this topic
        let topic_tag_ids: Vec<&str> = topic
            .tags
            .as_ref()
            .map(|t| t.iter().map(|s| s.as_str()).collect())
            .unwrap_or_default();

        let mut tag_names = Vec::new();
        let mut tag_keywords_list = Vec::new();

        for tag in tags {
            // Match by tag ID or tag name (frontend uses names sometimes)
            if topic_tag_ids.contains(&tag.id.as_str())
                || topic_tag_ids.contains(&tag.name.as_str())
            {
                tag_names.push(tag.name.clone());
                if let Some(kw) = &tag.search_keywords {
                    tag_keywords_list.extend(kw.clone());
                }
            }
        }

        let keywords = topic
            .search_keywords
            .as_ref()
            .map(|k| k.join(" "))
            .unwrap_or_default();

        doc!(
            self.fields.topic_id => topic.id.clone(),
            self.fields.header => topic.header.clone(),
            self.fields.description => topic.description.clone().unwrap_or_default(),
            self.fields.notes => topic.notes.clone().unwrap_or_default(),
            self.fields.keywords => keywords,
            self.fields.tag_names => tag_names.join(" "),
            self.fields.tag_keywords => tag_keywords_list.join(" ")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_topic(id: &str, header: &str, description: &str) -> Topic {
        Topic {
            id: id.to_string(),
            header: header.to_string(),
            description: Some(description.to_string()),
            tags: None,
            search_keywords: None,
            validity: crate::models::TopicValidity::default(),
            notes: None,
            raci: crate::models::TopicRaci::default(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            priority: None,
            has_file_number: None,
            file_number: None,
            has_shared_file_path: None,
            shared_file_path: None,
            size: None,
            version: 1,
        }
    }

    #[tokio::test]
    async fn test_search_index_creation() {
        let temp_dir = TempDir::new().unwrap();
        let index = SearchIndex::open(temp_dir.path()).unwrap();

        let topics = vec![
            create_test_topic("1", "Password Reset", "How to reset your password"),
            create_test_topic("2", "Onboarding", "New employee onboarding process"),
        ];

        index.rebuild(&topics, &[]).await.unwrap();

        let results = index.search("password", 10, 0).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].topic_id, "1");
    }

    #[tokio::test]
    async fn test_search_empty_query() {
        let temp_dir = TempDir::new().unwrap();
        let index = SearchIndex::open(temp_dir.path()).unwrap();

        let results = index.search("", 10, 0).unwrap();
        assert!(results.is_empty());
    }
}
