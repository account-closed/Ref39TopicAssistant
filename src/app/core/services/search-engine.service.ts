/**
 * FlexSearch-based search engine for Topics.
 * 
 * Features:
 * - Document index covering topics with tag content included
 * - Fuzzy matching with forward tokenization
 * - Field boosting (title weighted higher than text)
 * - Returns top N results sorted by relevance
 */

import { Injectable, signal, computed } from '@angular/core';
import { Document } from 'flexsearch';
import { Datastore, Topic } from '../models';

/**
 * Entity kinds that can be searched.
 */
export type SearchableKind = 'topic';

/**
 * Internal document structure for FlexSearch indexing.
 */
export interface SearchDocument {
  /** Unique ID: `topic:<uuid>`, `tag:<uuid>`, `member:<uuid>` */
  id: string;
  /** Entity type */
  kind: SearchableKind;
  /** Primary display label */
  title: string;
  /** Concatenated searchable text (includes title for boosting) */
  text: string;
  /** Index signature for FlexSearch compatibility */
  [key: string]: string;
}

/**
 * Search result returned from queries.
 */
export interface SearchHit {
  /** Document ID */
  id: string;
  /** Entity kind */
  kind: SearchableKind;
  /** Relevance score (higher = better match) */
  score: number;
  /** Display title */
  title: string;
  /** Original entity ID (UUID) */
  entityId: string;
}

/**
 * Index metadata stored in localStorage for change detection.
 */
export interface IndexMeta {
  /** SHA-256 checksum of datastore content */
  checksum: string;
  /** ISO timestamp when index was built */
  builtAt: string;
  /** FlexSearch version used */
  flexVersion: string;
}

const INDEX_META_KEY = 'search:indexMeta';
const FLEXSEARCH_VERSION = '0.8.212';

/**
 * Creates a composite ID for indexed documents.
 */
export function createDocumentId(kind: SearchableKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Parses a composite document ID into kind and entity ID.
 */
export function parseDocumentId(id: string): { kind: SearchableKind; entityId: string } {
  const colonIndex = id.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid document ID: ${id}`);
  }
  return {
    kind: id.substring(0, colonIndex) as SearchableKind,
    entityId: id.substring(colonIndex + 1)
  };
}

/**
 * Number of times to repeat title in the text field for boosting.
 * FlexSearch doesn't have native field weighting, so we boost title relevance
 * by duplicating it in the concatenated text field.
 */
const TITLE_BOOST_REPETITIONS = 2;

@Injectable({
  providedIn: 'root'
})
export class SearchEngineService {
  /**
   * FlexSearch Document index instance.
   * 
   * Note: Using 'any' type because FlexSearch's generic types (Document<D, W, S>)
   * have complex constraints that don't work well with our SearchDocument interface.
   * The SearchDocument interface has an index signature for FlexSearch compatibility,
   * but the generics still cause TypeScript errors. This is a known limitation
   * when using FlexSearch with TypeScript strict mode.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private index: any = null;
  
  /** Map of document ID to SearchDocument for quick lookup */
  private documentsMap = new Map<string, SearchDocument>();
  
  /** Map of tag ID to tag name for resolving tag references */
  private tagsById = new Map<string, string>();
  
  /** Signal indicating the index version (incremented on rebuild) */
  private indexVersionSignal = signal(0);
  
  /** Computed signal exposing the current index version */
  public readonly indexVersion = computed(() => this.indexVersionSignal());

  constructor() {}

  /**
   * Builds or rebuilds the search index from the datastore.
   * 
   * @param datastore - The datastore to index
   * @returns Promise that resolves when indexing is complete
   */
  async buildIndex(datastore: Datastore): Promise<void> {
    // Clear existing data
    this.documentsMap.clear();
    this.tagsById.clear();
    
    // Build tag lookup map first (needed for resolving tag references)
    for (const tag of datastore.tags || []) {
      this.tagsById.set(tag.id, tag.name);
    }
    
    // Create new FlexSearch Document index
    this.index = new Document({
      document: {
        id: 'id',
        index: ['title', 'text'],
        store: ['id', 'kind', 'title']
      },
      tokenize: 'forward',
      encoder: 'LatinExtra',  // Good for German umlauts
      resolution: 9,
      context: {
        depth: 2,
        bidirectional: true,
        resolution: 9
      },
      cache: true
    });

    // Index all documents
    const documents = this.createDocuments(datastore);
    for (const doc of documents) {
      this.documentsMap.set(doc.id, doc);
      this.index.add(doc);
    }

    // Increment version to notify consumers
    this.indexVersionSignal.update(v => v + 1);
  }

  /**
   * Searches the index and returns matching results.
   * 
   * @param query - Search query string
   * @param limit - Maximum number of results to return (default: 10)
   * @returns Array of SearchHit sorted by relevance (best first)
   */
  search(query: string, limit: number = 10): SearchHit[] {
    if (!this.index || !query || query.trim() === '') {
      return [];
    }

    const normalizedQuery = query.trim();
    
    // Search with enriched results to get document data
    const results = this.index.search(normalizedQuery, {
      limit: limit * 3, // Get more results to merge and dedupe
      suggest: true,    // Enable fuzzy suggestions
      enrich: true
    }) as Array<{ field: string; result: Array<{ id: string }> }>;

    // Merge results from different fields and compute scores
    const scoreMap = new Map<string, { score: number; doc: SearchDocument }>();

    for (const fieldResult of results) {
      const field = fieldResult.field;
      const baseScore = field === 'title' ? 100 : 50; // Boost title matches

      for (let i = 0; i < fieldResult.result.length; i++) {
        const item = fieldResult.result[i];
        const id = item.id as string;
        const doc = this.documentsMap.get(id);
        
        if (!doc) continue;

        // Score based on position in results and field importance
        const positionScore = (fieldResult.result.length - i) / fieldResult.result.length;
        const fieldScore = baseScore * positionScore;

        const existing = scoreMap.get(id);
        if (existing) {
          // Combine scores from multiple field matches
          existing.score = Math.max(existing.score, fieldScore) + fieldScore * 0.2;
        } else {
          scoreMap.set(id, { score: fieldScore, doc });
        }
      }
    }

    // Convert to SearchHit array and sort by score
    const hits: SearchHit[] = [];
    for (const [id, { score, doc }] of scoreMap) {
      const { kind, entityId } = parseDocumentId(id);
      hits.push({
        id,
        kind,
        score,
        title: doc.title,
        entityId
      });
    }

    // Sort by score descending (best first)
    hits.sort((a, b) => b.score - a.score);

    return hits.slice(0, limit);
  }

  /**
   * Gets the stored index metadata from localStorage.
   */
  getIndexMeta(): IndexMeta | null {
    try {
      const stored = localStorage.getItem(INDEX_META_KEY);
      if (stored) {
        return JSON.parse(stored) as IndexMeta;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Stores index metadata to localStorage.
   */
  setIndexMeta(checksum: string): void {
    const meta: IndexMeta = {
      checksum,
      builtAt: new Date().toISOString(),
      flexVersion: FLEXSEARCH_VERSION
    };
    localStorage.setItem(INDEX_META_KEY, JSON.stringify(meta));
  }

  /**
   * Returns the current index size (number of indexed documents).
   */
  getIndexSize(): number {
    return this.documentsMap.size;
  }

  /**
   * Creates SearchDocument entries from datastore entities.
   * Only indexes Topics since that's what we want to show in search results.
   * Tag content is included in topic documents to make them searchable via tags.
   */
  private createDocuments(datastore: Datastore): SearchDocument[] {
    const documents: SearchDocument[] = [];

    // Only index Topics (tag content is included in topic documents)
    for (const topic of datastore.topics) {
      documents.push(this.createTopicDocument(topic, datastore));
    }

    return documents;
  }

  /**
   * Creates a SearchDocument from a Topic.
   * Includes tag content (name, hinweise, keywords, copyPasteText) in the searchable text.
   */
  private createTopicDocument(topic: Topic, datastore: Datastore): SearchDocument {
    const title = topic.header;
    
    // Concatenate all searchable fields
    // Title is repeated TITLE_BOOST_REPETITIONS times to boost its relevance
    const textParts = [
      ...Array(TITLE_BOOST_REPETITIONS).fill(title),
      topic.description || '',
      topic.notes || '',
      ...(topic.searchKeywords || [])
    ];
    
    // Include tag content in searchable text (name, hinweise, keywords, copyPasteText)
    for (const tagRef of topic.tags || []) {
      // Try to find the full tag object
      const tag = (datastore.tags || []).find(t => t.id === tagRef || t.name === tagRef);
      if (tag) {
        textParts.push(tag.name);
        if (tag.hinweise) textParts.push(tag.hinweise);
        if (tag.copyPasteText) textParts.push(tag.copyPasteText);
        if (tag.searchKeywords) textParts.push(...tag.searchKeywords);
      } else {
        // Fallback to just the tag reference
        textParts.push(tagRef);
      }
    }

    return {
      id: createDocumentId('topic', topic.id),
      kind: 'topic',
      title,
      text: textParts.filter(Boolean).join(' ')
    };
  }
}
