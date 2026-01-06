import { Injectable } from '@angular/core';
import { Topic, TeamMember, Datastore } from '../models';
import { Index, IndexOptions, Encoders } from 'flexsearch';

export interface SearchResult {
  topic: Topic;
  score: number;
  matchType: 'header-exact' | 'header-prefix' | 'tag' | 'keyword' | 'description' | 'notes';
}

/** FlexSearch search result ID type */
type FlexSearchId = string | number;

@Injectable({
  providedIn: 'root'
})
export class SearchIndexService {
  private headerIndex: Index;
  private descriptionIndex: Index;
  private tagsIndex: Index;
  private keywordsIndex: Index;
  private notesIndex: Index;
  private topicsMap: Map<string, Topic> = new Map();
  private membersMap: Map<string, TeamMember> = new Map();

  constructor() {
    // Initialize FlexSearch indexes with German language support
    const indexConfig: IndexOptions = {
      encoder: 'LatinExtra' as Encoders,
      tokenize: 'forward',
      resolution: 9
    };

    this.headerIndex = new Index(indexConfig);
    this.descriptionIndex = new Index(indexConfig);
    this.tagsIndex = new Index(indexConfig);
    this.keywordsIndex = new Index(indexConfig);
    this.notesIndex = new Index(indexConfig);
  }

  buildIndex(datastore: Datastore): void {
    // Clear existing indexes
    this.topicsMap.clear();
    this.membersMap.clear();

    // Build members map
    datastore.members.forEach(member => {
      this.membersMap.set(member.id, member);
    });

    // Build topic indexes
    datastore.topics.forEach(topic => {
      this.topicsMap.set(topic.id, topic);

      // Index header (most important)
      const normalizedHeader = this.normalizeGerman(topic.header);
      this.headerIndex.add(topic.id, normalizedHeader);

      // Index description
      if (topic.description) {
        const normalizedDescription = this.normalizeGerman(topic.description);
        this.descriptionIndex.add(topic.id, normalizedDescription);
      }

      // Index tags
      if (topic.tags && topic.tags.length > 0) {
        const normalizedTags = topic.tags.map(t => this.normalizeGerman(t)).join(' ');
        this.tagsIndex.add(topic.id, normalizedTags);
      }

      // Index search keywords
      if (topic.searchKeywords && topic.searchKeywords.length > 0) {
        const normalizedKeywords = topic.searchKeywords.map(k => this.normalizeGerman(k)).join(' ');
        this.keywordsIndex.add(topic.id, normalizedKeywords);
      }

      // Index notes
      if (topic.notes) {
        const normalizedNotes = this.normalizeGerman(topic.notes);
        this.notesIndex.add(topic.id, normalizedNotes);
      }
    });
  }

  search(query: string, maxResults: number = 50): SearchResult[] {
    if (!query || query.trim() === '') {
      return [];
    }

    const normalizedQuery = this.normalizeGerman(query);
    const resultsMap = new Map<string, SearchResult>();

    // Search in header (highest priority)
    const headerResults = this.headerIndex.search(normalizedQuery, { limit: maxResults }) as FlexSearchId[];
    headerResults.forEach((id: FlexSearchId) => {
      const idStr = String(id);
      const topic = this.topicsMap.get(idStr);
      if (topic) {
        const normalizedHeader = this.normalizeGerman(topic.header);
        let score = 1000;
        let matchType: SearchResult['matchType'] = 'header-prefix';

        // Check for exact match
        if (normalizedHeader === normalizedQuery) {
          score = 2000;
          matchType = 'header-exact';
        } else if (normalizedHeader.startsWith(normalizedQuery)) {
          score = 1500;
          matchType = 'header-prefix';
        }

        resultsMap.set(idStr, { topic, score, matchType });
      }
    });

    // Search in tags
    const tagResults = this.tagsIndex.search(normalizedQuery, { limit: maxResults }) as FlexSearchId[];
    tagResults.forEach((id: FlexSearchId) => {
      const idStr = String(id);
      const topic = this.topicsMap.get(idStr);
      if (topic) {
        const existing = resultsMap.get(idStr);
        if (!existing) {
          resultsMap.set(idStr, { topic, score: 200, matchType: 'tag' });
        } else if (existing.score < 200) {
          existing.score = 200;
          existing.matchType = 'tag';
        }
      }
    });

    // Search in keywords
    const keywordResults = this.keywordsIndex.search(normalizedQuery, { limit: maxResults }) as FlexSearchId[];
    keywordResults.forEach((id: FlexSearchId) => {
      const idStr = String(id);
      const topic = this.topicsMap.get(idStr);
      if (topic) {
        const existing = resultsMap.get(idStr);
        if (!existing) {
          resultsMap.set(idStr, { topic, score: 150, matchType: 'keyword' });
        } else if (existing.score < 150) {
          existing.score = 150;
          existing.matchType = 'keyword';
        }
      }
    });

    // Search in description
    const descResults = this.descriptionIndex.search(normalizedQuery, { limit: maxResults }) as FlexSearchId[];
    descResults.forEach((id: FlexSearchId) => {
      const idStr = String(id);
      const topic = this.topicsMap.get(idStr);
      if (topic) {
        const existing = resultsMap.get(idStr);
        if (!existing) {
          resultsMap.set(idStr, { topic, score: 100, matchType: 'description' });
        } else if (existing.score < 100) {
          existing.score = 100;
          existing.matchType = 'description';
        }
      }
    });

    // Search in notes
    const notesResults = this.notesIndex.search(normalizedQuery, { limit: maxResults }) as FlexSearchId[];
    notesResults.forEach((id: FlexSearchId) => {
      const idStr = String(id);
      const topic = this.topicsMap.get(idStr);
      if (topic) {
        const existing = resultsMap.get(idStr);
        if (!existing) {
          resultsMap.set(idStr, { topic, score: 50, matchType: 'notes' });
        } else if (existing.score < 50) {
          existing.score = 50;
          existing.matchType = 'notes';
        }
      }
    });

    // Convert to array and sort by score
    const results = Array.from(resultsMap.values());
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, maxResults);
  }

  getMember(memberId: string): TeamMember | undefined {
    return this.membersMap.get(memberId);
  }

  private normalizeGerman(text: string): string {
    return text
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .trim();
  }

  getIndexSize(): number {
    return this.topicsMap.size;
  }
}
