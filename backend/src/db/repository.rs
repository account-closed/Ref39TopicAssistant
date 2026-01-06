//! Database repository for CRUD operations.
//!
//! Uses prepared statements and transactions for data integrity.

use chrono::Utc;
use sqlx::{Row, SqlitePool};

use crate::errors::AppError;
use crate::models::{
    CreateMemberRequest, CreateTagRequest, CreateTopicRequest, Datastore, RevisionInfo, TShirtSize,
    Tag, TeamMember, Topic, TopicRaci, TopicValidity, UpdateMemberRequest, UpdateTagRequest,
    UpdateTopicRequest,
};

/// Database repository for all data operations.
#[derive(Clone)]
pub struct Repository {
    pool: SqlitePool,
}

impl Repository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Get the current revision ID.
    pub async fn get_revision_id(&self) -> Result<i64, AppError> {
        let row = sqlx::query("SELECT revision_id FROM meta WHERE id = 1")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.get("revision_id"))
    }

    /// Get revision info.
    pub async fn get_revision_info(&self) -> Result<RevisionInfo, AppError> {
        let row = sqlx::query("SELECT revision_id, generated_at FROM meta WHERE id = 1")
            .fetch_one(&self.pool)
            .await?;
        Ok(RevisionInfo {
            revision_id: row.get("revision_id"),
            generated_at: row.get("generated_at"),
        })
    }

    /// Increment the revision ID and return the new value.
    pub async fn increment_revision(&self) -> Result<i64, AppError> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE meta SET revision_id = revision_id + 1, generated_at = ? WHERE id = 1")
            .bind(&now)
            .execute(&self.pool)
            .await?;
        self.get_revision_id().await
    }

    /// Get the full datastore.
    pub async fn get_datastore(&self) -> Result<Datastore, AppError> {
        let meta =
            sqlx::query("SELECT schema_version, revision_id, generated_at FROM meta WHERE id = 1")
                .fetch_one(&self.pool)
                .await?;

        let members = self.list_members().await?;
        let topics = self.list_topics().await?;
        let tags = self.list_tags().await?;

        Ok(Datastore {
            schema_version: meta.get("schema_version"),
            revision_id: meta.get("revision_id"),
            generated_at: meta.get("generated_at"),
            members,
            topics,
            tags: Some(tags),
        })
    }

    // ==================== MEMBER OPERATIONS ====================

    /// List all members.
    pub async fn list_members(&self) -> Result<Vec<TeamMember>, AppError> {
        let rows = sqlx::query(
            "SELECT id, display_name, email, active, tags, color, updated_at, version FROM members ORDER BY display_name"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| member_from_row(&row)).collect())
    }

    /// Get a member by ID.
    pub async fn get_member(&self, id: &str) -> Result<Option<TeamMember>, AppError> {
        let row = sqlx::query(
            "SELECT id, display_name, email, active, tags, color, updated_at, version FROM members WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.as_ref().map(member_from_row))
    }

    /// Create a new member.
    pub async fn create_member(
        &self,
        request: &CreateMemberRequest,
    ) -> Result<TeamMember, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let tags_json = request
            .tags
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());

        sqlx::query(
            "INSERT INTO members (id, display_name, email, active, tags, color, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(&id)
        .bind(&request.display_name)
        .bind(&request.email)
        .bind(request.active as i32)
        .bind(&tags_json)
        .bind(&request.color)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.increment_revision().await?;

        Ok(TeamMember {
            id,
            display_name: request.display_name.clone(),
            email: request.email.clone(),
            active: request.active,
            tags: request.tags.clone(),
            color: request.color.clone(),
            updated_at: now,
            version: 1,
        })
    }

    /// Update a member with optimistic concurrency control.
    pub async fn update_member(
        &self,
        id: &str,
        request: &UpdateMemberRequest,
    ) -> Result<TeamMember, AppError> {
        let existing = self
            .get_member(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Member {} not found", id)))?;

        // Check version for optimistic concurrency
        if let Some(expected) = request.expected_version {
            if existing.version != expected {
                return Err(AppError::Conflict {
                    message: format!(
                        "Version mismatch: expected {}, current {}",
                        expected, existing.version
                    ),
                    current_version: existing.version,
                });
            }
        }

        let now = Utc::now().to_rfc3339();
        let new_version = existing.version + 1;

        let display_name = request
            .display_name
            .as_ref()
            .unwrap_or(&existing.display_name);
        let email = request.email.clone().or(existing.email.clone());
        let active = request.active.unwrap_or(existing.active);
        let tags = request.tags.clone().or(existing.tags.clone());
        let color = request.color.clone().or(existing.color.clone());
        let tags_json = tags
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());

        // Use conditional UPDATE with version check to prevent race conditions
        let result = sqlx::query(
            "UPDATE members SET display_name = ?, email = ?, active = ?, tags = ?, color = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?"
        )
        .bind(display_name)
        .bind(&email)
        .bind(active as i32)
        .bind(&tags_json)
        .bind(&color)
        .bind(&now)
        .bind(new_version)
        .bind(id)
        .bind(existing.version)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            // Race condition - version changed between read and write
            let current = self.get_member(id).await?;
            return Err(AppError::Conflict {
                message: "Concurrent modification detected".to_string(),
                current_version: current.map(|m| m.version).unwrap_or(0),
            });
        }

        self.increment_revision().await?;

        Ok(TeamMember {
            id: id.to_string(),
            display_name: display_name.clone(),
            email,
            active,
            tags,
            color,
            updated_at: now,
            version: new_version,
        })
    }

    /// Delete a member.
    pub async fn delete_member(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM members WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("Member {} not found", id)));
        }

        self.increment_revision().await?;
        Ok(())
    }

    // ==================== TAG OPERATIONS ====================

    /// List all tags.
    pub async fn list_tags(&self) -> Result<Vec<Tag>, AppError> {
        let rows = sqlx::query(
            "SELECT id, name, search_keywords, hinweise, copy_paste_text, color, is_super_tag, is_gvpl_tag, created_at, modified_at, created_by, version FROM tags ORDER BY name"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| tag_from_row(&row)).collect())
    }

    /// Get a tag by ID.
    pub async fn get_tag(&self, id: &str) -> Result<Option<Tag>, AppError> {
        let row = sqlx::query(
            "SELECT id, name, search_keywords, hinweise, copy_paste_text, color, is_super_tag, is_gvpl_tag, created_at, modified_at, created_by, version FROM tags WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.as_ref().map(tag_from_row))
    }

    /// Create a new tag.
    pub async fn create_tag(&self, request: &CreateTagRequest) -> Result<Tag, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let keywords_json = request
            .search_keywords
            .as_ref()
            .map(|k| serde_json::to_string(k).unwrap_or_default());

        sqlx::query(
            "INSERT INTO tags (id, name, search_keywords, hinweise, copy_paste_text, color, is_super_tag, is_gvpl_tag, created_at, modified_at, created_by, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(&id)
        .bind(&request.name)
        .bind(&keywords_json)
        .bind(&request.hinweise)
        .bind(&request.copy_paste_text)
        .bind(&request.color)
        .bind(request.is_super_tag.map(|b| b as i32))
        .bind(request.is_gvpl_tag.map(|b| b as i32))
        .bind(&now)
        .bind(&now)
        .bind(&request.created_by)
        .execute(&self.pool)
        .await?;

        self.increment_revision().await?;

        Ok(Tag {
            id,
            name: request.name.clone(),
            search_keywords: request.search_keywords.clone(),
            hinweise: request.hinweise.clone(),
            copy_paste_text: request.copy_paste_text.clone(),
            color: request.color.clone(),
            is_super_tag: request.is_super_tag,
            is_gvpl_tag: request.is_gvpl_tag,
            created_at: now.clone(),
            modified_at: now,
            created_by: request.created_by.clone(),
            version: 1,
        })
    }

    /// Update a tag with optimistic concurrency control.
    pub async fn update_tag(&self, id: &str, request: &UpdateTagRequest) -> Result<Tag, AppError> {
        let existing = self
            .get_tag(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Tag {} not found", id)))?;

        // Check version for optimistic concurrency
        if let Some(expected) = request.expected_version {
            if existing.version != expected {
                return Err(AppError::Conflict {
                    message: format!(
                        "Version mismatch: expected {}, current {}",
                        expected, existing.version
                    ),
                    current_version: existing.version,
                });
            }
        }

        let now = Utc::now().to_rfc3339();
        let new_version = existing.version + 1;

        let name = request.name.as_ref().unwrap_or(&existing.name);
        let search_keywords = request
            .search_keywords
            .clone()
            .or(existing.search_keywords.clone());
        let hinweise = request.hinweise.clone().or(existing.hinweise.clone());
        let copy_paste_text = request
            .copy_paste_text
            .clone()
            .or(existing.copy_paste_text.clone());
        let color = request.color.clone().or(existing.color.clone());
        let is_super_tag = request.is_super_tag.or(existing.is_super_tag);
        let is_gvpl_tag = request.is_gvpl_tag.or(existing.is_gvpl_tag);
        let keywords_json = search_keywords
            .as_ref()
            .map(|k| serde_json::to_string(k).unwrap_or_default());

        let result = sqlx::query(
            "UPDATE tags SET name = ?, search_keywords = ?, hinweise = ?, copy_paste_text = ?, color = ?, is_super_tag = ?, is_gvpl_tag = ?, modified_at = ?, version = ? WHERE id = ? AND version = ?"
        )
        .bind(name)
        .bind(&keywords_json)
        .bind(&hinweise)
        .bind(&copy_paste_text)
        .bind(&color)
        .bind(is_super_tag.map(|b| b as i32))
        .bind(is_gvpl_tag.map(|b| b as i32))
        .bind(&now)
        .bind(new_version)
        .bind(id)
        .bind(existing.version)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            let current = self.get_tag(id).await?;
            return Err(AppError::Conflict {
                message: "Concurrent modification detected".to_string(),
                current_version: current.map(|t| t.version).unwrap_or(0),
            });
        }

        self.increment_revision().await?;

        Ok(Tag {
            id: id.to_string(),
            name: name.clone(),
            search_keywords,
            hinweise,
            copy_paste_text,
            color,
            is_super_tag,
            is_gvpl_tag,
            created_at: existing.created_at,
            modified_at: now,
            created_by: existing.created_by,
            version: new_version,
        })
    }

    /// Delete a tag.
    pub async fn delete_tag(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM tags WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("Tag {} not found", id)));
        }

        self.increment_revision().await?;
        Ok(())
    }

    // ==================== TOPIC OPERATIONS ====================

    /// List all topics.
    pub async fn list_topics(&self) -> Result<Vec<Topic>, AppError> {
        let rows = sqlx::query(
            r#"SELECT id, header, description, tags, search_keywords, 
                      validity_always_valid, validity_valid_from, validity_valid_to,
                      notes, raci_r1_member_id, raci_r2_member_id, raci_r3_member_id,
                      raci_c_member_ids, raci_i_member_ids, updated_at, priority,
                      has_file_number, file_number, has_shared_file_path, shared_file_path,
                      size, version
               FROM topics ORDER BY header"#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.iter().map(topic_from_row).collect())
    }

    /// Get a topic by ID.
    pub async fn get_topic(&self, id: &str) -> Result<Option<Topic>, AppError> {
        let row = sqlx::query(
            r#"SELECT id, header, description, tags, search_keywords, 
                      validity_always_valid, validity_valid_from, validity_valid_to,
                      notes, raci_r1_member_id, raci_r2_member_id, raci_r3_member_id,
                      raci_c_member_ids, raci_i_member_ids, updated_at, priority,
                      has_file_number, file_number, has_shared_file_path, shared_file_path,
                      size, version
               FROM topics WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.as_ref().map(topic_from_row))
    }

    /// Create a new topic.
    pub async fn create_topic(&self, request: &CreateTopicRequest) -> Result<Topic, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let validity = request.validity.clone().unwrap_or_default();
        let tags_json = request
            .tags
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());
        let keywords_json = request
            .search_keywords
            .as_ref()
            .map(|k| serde_json::to_string(k).unwrap_or_default());
        let c_ids_json = serde_json::to_string(&request.raci.c_member_ids).unwrap_or_default();
        let i_ids_json = serde_json::to_string(&request.raci.i_member_ids).unwrap_or_default();
        let size_str = request.size.as_ref().map(|s| s.as_str().to_string());

        sqlx::query(
            r#"INSERT INTO topics (
                id, header, description, tags, search_keywords,
                validity_always_valid, validity_valid_from, validity_valid_to,
                notes, raci_r1_member_id, raci_r2_member_id, raci_r3_member_id,
                raci_c_member_ids, raci_i_member_ids, updated_at, priority,
                has_file_number, file_number, has_shared_file_path, shared_file_path,
                size, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"#,
        )
        .bind(&id)
        .bind(&request.header)
        .bind(&request.description)
        .bind(&tags_json)
        .bind(&keywords_json)
        .bind(validity.always_valid as i32)
        .bind(&validity.valid_from)
        .bind(&validity.valid_to)
        .bind(&request.notes)
        .bind(&request.raci.r1_member_id)
        .bind(&request.raci.r2_member_id)
        .bind(&request.raci.r3_member_id)
        .bind(&c_ids_json)
        .bind(&i_ids_json)
        .bind(&now)
        .bind(request.priority)
        .bind(request.has_file_number.map(|b| b as i32))
        .bind(&request.file_number)
        .bind(request.has_shared_file_path.map(|b| b as i32))
        .bind(&request.shared_file_path)
        .bind(&size_str)
        .execute(&self.pool)
        .await?;

        self.increment_revision().await?;

        Ok(Topic {
            id,
            header: request.header.clone(),
            description: request.description.clone(),
            tags: request.tags.clone(),
            search_keywords: request.search_keywords.clone(),
            validity,
            notes: request.notes.clone(),
            raci: request.raci.clone(),
            updated_at: now,
            priority: request.priority,
            has_file_number: request.has_file_number,
            file_number: request.file_number.clone(),
            has_shared_file_path: request.has_shared_file_path,
            shared_file_path: request.shared_file_path.clone(),
            size: request.size.clone(),
            version: 1,
        })
    }

    /// Update a topic with optimistic concurrency control.
    pub async fn update_topic(
        &self,
        id: &str,
        request: &UpdateTopicRequest,
    ) -> Result<Topic, AppError> {
        let existing = self
            .get_topic(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Topic {} not found", id)))?;

        // Check version for optimistic concurrency
        if let Some(expected) = request.expected_version {
            if existing.version != expected {
                return Err(AppError::Conflict {
                    message: format!(
                        "Version mismatch: expected {}, current {}",
                        expected, existing.version
                    ),
                    current_version: existing.version,
                });
            }
        }

        let now = Utc::now().to_rfc3339();
        let new_version = existing.version + 1;

        let header = request.header.as_ref().unwrap_or(&existing.header);
        let description = request.description.clone().or(existing.description.clone());
        let tags = request.tags.clone().or(existing.tags.clone());
        let search_keywords = request
            .search_keywords
            .clone()
            .or(existing.search_keywords.clone());
        let validity = request
            .validity
            .clone()
            .unwrap_or(existing.validity.clone());
        let notes = request.notes.clone().or(existing.notes.clone());
        let raci = request.raci.clone().unwrap_or(existing.raci.clone());
        let priority = request.priority.or(existing.priority);
        let has_file_number = request.has_file_number.or(existing.has_file_number);
        let file_number = request.file_number.clone().or(existing.file_number.clone());
        let has_shared_file_path = request
            .has_shared_file_path
            .or(existing.has_shared_file_path);
        let shared_file_path = request
            .shared_file_path
            .clone()
            .or(existing.shared_file_path.clone());
        let size = request.size.clone().or(existing.size.clone());

        let tags_json = tags
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());
        let keywords_json = search_keywords
            .as_ref()
            .map(|k| serde_json::to_string(k).unwrap_or_default());
        let c_ids_json = serde_json::to_string(&raci.c_member_ids).unwrap_or_default();
        let i_ids_json = serde_json::to_string(&raci.i_member_ids).unwrap_or_default();
        let size_str = size.as_ref().map(|s| s.as_str().to_string());

        let result = sqlx::query(
            r#"UPDATE topics SET
                header = ?, description = ?, tags = ?, search_keywords = ?,
                validity_always_valid = ?, validity_valid_from = ?, validity_valid_to = ?,
                notes = ?, raci_r1_member_id = ?, raci_r2_member_id = ?, raci_r3_member_id = ?,
                raci_c_member_ids = ?, raci_i_member_ids = ?, updated_at = ?, priority = ?,
                has_file_number = ?, file_number = ?, has_shared_file_path = ?, shared_file_path = ?,
                size = ?, version = ?
            WHERE id = ? AND version = ?"#,
        )
        .bind(header)
        .bind(&description)
        .bind(&tags_json)
        .bind(&keywords_json)
        .bind(validity.always_valid as i32)
        .bind(&validity.valid_from)
        .bind(&validity.valid_to)
        .bind(&notes)
        .bind(&raci.r1_member_id)
        .bind(&raci.r2_member_id)
        .bind(&raci.r3_member_id)
        .bind(&c_ids_json)
        .bind(&i_ids_json)
        .bind(&now)
        .bind(priority)
        .bind(has_file_number.map(|b| b as i32))
        .bind(&file_number)
        .bind(has_shared_file_path.map(|b| b as i32))
        .bind(&shared_file_path)
        .bind(&size_str)
        .bind(new_version)
        .bind(id)
        .bind(existing.version)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            let current = self.get_topic(id).await?;
            return Err(AppError::Conflict {
                message: "Concurrent modification detected".to_string(),
                current_version: current.map(|t| t.version).unwrap_or(0),
            });
        }

        self.increment_revision().await?;

        Ok(Topic {
            id: id.to_string(),
            header: header.clone(),
            description,
            tags,
            search_keywords,
            validity,
            notes,
            raci,
            updated_at: now,
            priority,
            has_file_number,
            file_number,
            has_shared_file_path,
            shared_file_path,
            size,
            version: new_version,
        })
    }

    /// Delete a topic.
    pub async fn delete_topic(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM topics WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("Topic {} not found", id)));
        }

        self.increment_revision().await?;
        Ok(())
    }

    /// Batch update multiple topics.
    pub async fn batch_update_topics(
        &self,
        updates: &[(String, UpdateTopicRequest)],
    ) -> Result<Vec<Topic>, AppError> {
        let mut results = Vec::new();

        // Use a transaction for atomicity
        let mut tx = self.pool.begin().await?;

        for (topic_id, request) in updates {
            // Get current topic
            let row = sqlx::query(
                r#"SELECT id, header, description, tags, search_keywords, 
                          validity_always_valid, validity_valid_from, validity_valid_to,
                          notes, raci_r1_member_id, raci_r2_member_id, raci_r3_member_id,
                          raci_c_member_ids, raci_i_member_ids, updated_at, priority,
                          has_file_number, file_number, has_shared_file_path, shared_file_path,
                          size, version
                   FROM topics WHERE id = ?"#,
            )
            .bind(topic_id)
            .fetch_optional(&mut *tx)
            .await?;

            let existing = row
                .as_ref()
                .map(topic_from_row)
                .ok_or_else(|| AppError::NotFound(format!("Topic {} not found", topic_id)))?;

            // Check version if provided
            if let Some(expected) = request.expected_version {
                if existing.version != expected {
                    return Err(AppError::Conflict {
                        message: format!(
                            "Version mismatch for topic {}: expected {}, current {}",
                            topic_id, expected, existing.version
                        ),
                        current_version: existing.version,
                    });
                }
            }

            let now = Utc::now().to_rfc3339();
            let new_version = existing.version + 1;

            let header = request.header.as_ref().unwrap_or(&existing.header);
            let description = request.description.clone().or(existing.description.clone());
            let tags = request.tags.clone().or(existing.tags.clone());
            let search_keywords = request
                .search_keywords
                .clone()
                .or(existing.search_keywords.clone());
            let validity = request
                .validity
                .clone()
                .unwrap_or(existing.validity.clone());
            let notes = request.notes.clone().or(existing.notes.clone());
            let raci = request.raci.clone().unwrap_or(existing.raci.clone());
            let priority = request.priority.or(existing.priority);
            let has_file_number = request.has_file_number.or(existing.has_file_number);
            let file_number = request.file_number.clone().or(existing.file_number.clone());
            let has_shared_file_path = request
                .has_shared_file_path
                .or(existing.has_shared_file_path);
            let shared_file_path = request
                .shared_file_path
                .clone()
                .or(existing.shared_file_path.clone());
            let size = request.size.clone().or(existing.size.clone());

            let tags_json = tags
                .as_ref()
                .map(|t| serde_json::to_string(t).unwrap_or_default());
            let keywords_json = search_keywords
                .as_ref()
                .map(|k| serde_json::to_string(k).unwrap_or_default());
            let c_ids_json = serde_json::to_string(&raci.c_member_ids).unwrap_or_default();
            let i_ids_json = serde_json::to_string(&raci.i_member_ids).unwrap_or_default();
            let size_str = size.as_ref().map(|s| s.as_str().to_string());

            let result = sqlx::query(
                r#"UPDATE topics SET
                    header = ?, description = ?, tags = ?, search_keywords = ?,
                    validity_always_valid = ?, validity_valid_from = ?, validity_valid_to = ?,
                    notes = ?, raci_r1_member_id = ?, raci_r2_member_id = ?, raci_r3_member_id = ?,
                    raci_c_member_ids = ?, raci_i_member_ids = ?, updated_at = ?, priority = ?,
                    has_file_number = ?, file_number = ?, has_shared_file_path = ?, shared_file_path = ?,
                    size = ?, version = ?
                WHERE id = ? AND version = ?"#,
            )
            .bind(header)
            .bind(&description)
            .bind(&tags_json)
            .bind(&keywords_json)
            .bind(validity.always_valid as i32)
            .bind(&validity.valid_from)
            .bind(&validity.valid_to)
            .bind(&notes)
            .bind(&raci.r1_member_id)
            .bind(&raci.r2_member_id)
            .bind(&raci.r3_member_id)
            .bind(&c_ids_json)
            .bind(&i_ids_json)
            .bind(&now)
            .bind(priority)
            .bind(has_file_number.map(|b| b as i32))
            .bind(&file_number)
            .bind(has_shared_file_path.map(|b| b as i32))
            .bind(&shared_file_path)
            .bind(&size_str)
            .bind(new_version)
            .bind(topic_id)
            .bind(existing.version)
            .execute(&mut *tx)
            .await?;

            if result.rows_affected() == 0 {
                return Err(AppError::Conflict {
                    message: format!("Concurrent modification detected for topic {}", topic_id),
                    current_version: existing.version,
                });
            }

            results.push(Topic {
                id: topic_id.clone(),
                header: header.clone(),
                description,
                tags,
                search_keywords,
                validity,
                notes,
                raci,
                updated_at: now,
                priority,
                has_file_number,
                file_number,
                has_shared_file_path,
                shared_file_path,
                size,
                version: new_version,
            });
        }

        // Increment revision once for the entire batch
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE meta SET revision_id = revision_id + 1, generated_at = ? WHERE id = 1")
            .bind(&now)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        Ok(results)
    }
}

// Helper functions for row conversion

fn member_from_row(row: &sqlx::sqlite::SqliteRow) -> TeamMember {
    let active: i32 = row.get("active");
    let tags_str: Option<String> = row.get("tags");
    TeamMember {
        id: row.get("id"),
        display_name: row.get("display_name"),
        email: row.get("email"),
        active: active != 0,
        tags: tags_str.map(|s| parse_json_array(&s)),
        color: row.get("color"),
        updated_at: row.get("updated_at"),
        version: row.get("version"),
    }
}

fn tag_from_row(row: &sqlx::sqlite::SqliteRow) -> Tag {
    let is_super_tag: Option<i32> = row.get("is_super_tag");
    let is_gvpl_tag: Option<i32> = row.get("is_gvpl_tag");
    let search_keywords_str: Option<String> = row.get("search_keywords");
    Tag {
        id: row.get("id"),
        name: row.get("name"),
        search_keywords: search_keywords_str.map(|s| parse_json_array(&s)),
        hinweise: row.get("hinweise"),
        copy_paste_text: row.get("copy_paste_text"),
        color: row.get("color"),
        is_super_tag: is_super_tag.map(|v| v != 0),
        is_gvpl_tag: is_gvpl_tag.map(|v| v != 0),
        created_at: row.get("created_at"),
        modified_at: row.get("modified_at"),
        created_by: row.get("created_by"),
        version: row.get("version"),
    }
}

fn topic_from_row(row: &sqlx::sqlite::SqliteRow) -> Topic {
    let validity_always_valid: i32 = row.get("validity_always_valid");
    let has_file_number: Option<i32> = row.get("has_file_number");
    let has_shared_file_path: Option<i32> = row.get("has_shared_file_path");
    let tags_str: Option<String> = row.get("tags");
    let search_keywords_str: Option<String> = row.get("search_keywords");
    let c_member_ids_str: Option<String> = row.get("raci_c_member_ids");
    let i_member_ids_str: Option<String> = row.get("raci_i_member_ids");
    let size_str: Option<String> = row.get("size");

    Topic {
        id: row.get("id"),
        header: row.get("header"),
        description: row.get("description"),
        tags: tags_str.map(|s| parse_json_array(&s)),
        search_keywords: search_keywords_str.map(|s| parse_json_array(&s)),
        validity: TopicValidity {
            always_valid: validity_always_valid != 0,
            valid_from: row.get("validity_valid_from"),
            valid_to: row.get("validity_valid_to"),
        },
        notes: row.get("notes"),
        raci: TopicRaci {
            r1_member_id: row.get("raci_r1_member_id"),
            r2_member_id: row.get("raci_r2_member_id"),
            r3_member_id: row.get("raci_r3_member_id"),
            c_member_ids: c_member_ids_str
                .map(|s| parse_json_array(&s))
                .unwrap_or_default(),
            i_member_ids: i_member_ids_str
                .map(|s| parse_json_array(&s))
                .unwrap_or_default(),
        },
        updated_at: row.get("updated_at"),
        priority: row.get("priority"),
        has_file_number: has_file_number.map(|v| v != 0),
        file_number: row.get("file_number"),
        has_shared_file_path: has_shared_file_path.map(|v| v != 0),
        shared_file_path: row.get("shared_file_path"),
        size: size_str.and_then(|s| TShirtSize::from_str(&s)),
        version: row.get("version"),
    }
}

fn parse_json_array(s: &str) -> Vec<String> {
    serde_json::from_str(s).unwrap_or_default()
}
