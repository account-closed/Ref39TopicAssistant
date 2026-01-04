import { Injectable } from '@angular/core';
import { Topic, TeamMember, Datastore } from '../models';

export interface SearchResult {
  topic: Topic;
  score: number;
  matchType: 'header-exact' | 'header-prefix' | 'tag' | 'keyword' | 'description' | 'notes';
}

interface IndexedTopic {
  topic: Topic;
  normalizedHeader: string;
  normalizedDescription: string;
  normalizedTags: string[];
  normalizedKeywords: string[];
  normalizedNotes: string;
  searchBlob: string;
}

@Injectable({
  providedIn: 'root'
})
export class SearchIndexService {
  private index: IndexedTopic[] = [];
  private membersMap: Map<string, TeamMember> = new Map();

  buildIndex(datastore: Datastore): void {
    this.index = [];
    this.membersMap.clear();

    // Build members map
    datastore.members.forEach(member => {
      this.membersMap.set(member.id, member);
    });

    // Build topic index
    datastore.topics.forEach(topic => {
      const indexed: IndexedTopic = {
        topic,
        normalizedHeader: this.normalizeGerman(topic.header),
        normalizedDescription: this.normalizeGerman(topic.description || ''),
        normalizedTags: (topic.tags || []).map(t => this.normalizeGerman(t)),
        normalizedKeywords: (topic.searchKeywords || []).map(k => this.normalizeGerman(k)),
        normalizedNotes: this.normalizeGerman(topic.notes || ''),
        searchBlob: ''
      };

      // Create search blob
      indexed.searchBlob = [
        indexed.normalizedHeader,
        indexed.normalizedDescription,
        ...indexed.normalizedTags,
        ...indexed.normalizedKeywords,
        indexed.normalizedNotes
      ].join(' ');

      this.index.push(indexed);
    });
  }

  search(query: string, maxResults: number = 50): SearchResult[] {
    if (!query || query.trim() === '') {
      return [];
    }

    const normalizedQuery = this.normalizeGerman(query);
    const queryTokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);

    const results: SearchResult[] = [];

    for (const indexed of this.index) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'description';

      // Check header exact match (highest priority)
      if (indexed.normalizedHeader === normalizedQuery) {
        score = 1000;
        matchType = 'header-exact';
      }
      // Check header prefix match
      else if (indexed.normalizedHeader.startsWith(normalizedQuery)) {
        score = 500;
        matchType = 'header-prefix';
      }
      // Check if all query tokens appear in header
      else if (queryTokens.every(token => indexed.normalizedHeader.includes(token))) {
        score = 300;
        matchType = 'header-prefix';
      }
      // Check tags
      else if (indexed.normalizedTags.some(tag => 
        tag === normalizedQuery || tag.includes(normalizedQuery)
      )) {
        score = 200;
        matchType = 'tag';
      }
      // Check keywords
      else if (indexed.normalizedKeywords.some(keyword => 
        keyword === normalizedQuery || keyword.includes(normalizedQuery)
      )) {
        score = 150;
        matchType = 'keyword';
      }
      // Check description
      else if (indexed.normalizedDescription.includes(normalizedQuery) ||
               queryTokens.every(token => indexed.normalizedDescription.includes(token))) {
        score = 100;
        matchType = 'description';
      }
      // Check notes
      else if (indexed.normalizedNotes.includes(normalizedQuery) ||
               queryTokens.every(token => indexed.normalizedNotes.includes(token))) {
        score = 50;
        matchType = 'notes';
      }
      // Fuzzy match in search blob
      else if (queryTokens.some(token => indexed.searchBlob.includes(token))) {
        score = 25;
        matchType = 'description';
      }

      if (score > 0) {
        results.push({
          topic: indexed.topic,
          score,
          matchType
        });
      }
    }

    // Sort by score (descending)
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
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .trim();
  }

  getIndexSize(): number {
    return this.index.length;
  }
}
