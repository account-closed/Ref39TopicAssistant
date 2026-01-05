import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchEngineService, createDocumentId, parseDocumentId, SearchHit } from './search-engine.service';
import { Datastore, Topic, Tag, TeamMember } from '../models';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('Document ID utilities', () => {
  describe('createDocumentId', () => {
    it('should create topic document ID', () => {
      expect(createDocumentId('topic', 'abc-123')).toBe('topic:abc-123');
    });

    it('should create tag document ID', () => {
      expect(createDocumentId('tag', 'def-456')).toBe('tag:def-456');
    });

    it('should create member document ID', () => {
      expect(createDocumentId('member', 'ghi-789')).toBe('member:ghi-789');
    });
  });

  describe('parseDocumentId', () => {
    it('should parse topic document ID', () => {
      const result = parseDocumentId('topic:abc-123');
      expect(result.kind).toBe('topic');
      expect(result.entityId).toBe('abc-123');
    });

    it('should parse tag document ID', () => {
      const result = parseDocumentId('tag:def-456');
      expect(result.kind).toBe('tag');
      expect(result.entityId).toBe('def-456');
    });

    it('should parse member document ID', () => {
      const result = parseDocumentId('member:ghi-789');
      expect(result.kind).toBe('member');
      expect(result.entityId).toBe('ghi-789');
    });

    it('should handle IDs with colons', () => {
      const result = parseDocumentId('topic:uuid:with:colons');
      expect(result.kind).toBe('topic');
      expect(result.entityId).toBe('uuid:with:colons');
    });

    it('should throw for invalid ID without colon', () => {
      expect(() => parseDocumentId('invalid')).toThrow('Invalid document ID');
    });
  });
});

describe('SearchEngineService', () => {
  let service: SearchEngineService;
  
  const createTopic = (id: string, header: string, extras: Partial<Topic> = {}): Topic => ({
    id,
    header,
    validity: { alwaysValid: true },
    raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] },
    updatedAt: '2024-01-01T00:00:00Z',
    ...extras
  });

  const createTag = (id: string, name: string, extras: Partial<Tag> = {}): Tag => ({
    id,
    name,
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    createdBy: 'member-1',
    ...extras
  });

  const createMember = (id: string, displayName: string, extras: Partial<TeamMember> = {}): TeamMember => ({
    id,
    displayName,
    active: true,
    updatedAt: '2024-01-01T00:00:00Z',
    ...extras
  });

  const createDatastore = (overrides: Partial<Datastore> = {}): Datastore => ({
    schemaVersion: 1,
    generatedAt: '2024-01-01T00:00:00Z',
    revisionId: 1,
    members: [],
    topics: [],
    tags: [],
    ...overrides
  });

  beforeEach(() => {
    localStorageMock.clear();
    service = new SearchEngineService();
  });

  describe('buildIndex', () => {
    it('should build index from empty datastore', async () => {
      const ds = createDatastore();
      await service.buildIndex(ds);
      expect(service.getIndexSize()).toBe(0);
    });

    it('should index topics', async () => {
      const ds = createDatastore({
        topics: [
          createTopic('t1', 'First Topic'),
          createTopic('t2', 'Second Topic')
        ]
      });
      await service.buildIndex(ds);
      expect(service.getIndexSize()).toBe(2);
    });

    it('should index tags', async () => {
      const ds = createDatastore({
        tags: [
          createTag('tag1', 'Important'),
          createTag('tag2', 'Urgent')
        ]
      });
      await service.buildIndex(ds);
      expect(service.getIndexSize()).toBe(2);
    });

    it('should index members', async () => {
      const ds = createDatastore({
        members: [
          createMember('m1', 'John Doe'),
          createMember('m2', 'Jane Smith')
        ]
      });
      await service.buildIndex(ds);
      expect(service.getIndexSize()).toBe(2);
    });

    it('should index all entity types', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Topic One')],
        tags: [createTag('tag1', 'Tag One')],
        members: [createMember('m1', 'Member One')]
      });
      await service.buildIndex(ds);
      expect(service.getIndexSize()).toBe(3);
    });

    it('should increment index version on rebuild', async () => {
      const ds = createDatastore();
      const initialVersion = service.indexVersion();
      
      await service.buildIndex(ds);
      expect(service.indexVersion()).toBe(initialVersion + 1);
      
      await service.buildIndex(ds);
      expect(service.indexVersion()).toBe(initialVersion + 2);
    });
  });

  describe('search', () => {
    it('should return empty array for empty query', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Test Topic')]
      });
      await service.buildIndex(ds);
      
      expect(service.search('')).toEqual([]);
      expect(service.search('   ')).toEqual([]);
    });

    it('should return empty array if index not built', () => {
      expect(service.search('test')).toEqual([]);
    });

    it('should find topic by header', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Urlaubsantrag')]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Urlaub');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].kind).toBe('topic');
      expect(results[0].title).toBe('Urlaubsantrag');
    });

    it('should find topic by description', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Generic Title', {
          description: 'Contains special keyword FINDME'
        })]
      });
      await service.buildIndex(ds);
      
      const results = service.search('FINDME');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entityId).toBe('t1');
    });

    it('should find topic by searchKeywords', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Vacation Request', {
          searchKeywords: ['PTO', 'TimeOff', 'Holiday']
        })]
      });
      await service.buildIndex(ds);
      
      const results = service.search('TimeOff');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entityId).toBe('t1');
    });

    it('should find tag by name', async () => {
      const ds = createDatastore({
        tags: [createTag('tag1', 'Personnel')]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Personnel');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].kind).toBe('tag');
      expect(results[0].title).toBe('Personnel');
    });

    it('should find member by displayName', async () => {
      const ds = createDatastore({
        members: [createMember('m1', 'Hans Mueller')]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Mueller');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].kind).toBe('member');
      expect(results[0].title).toBe('Hans Mueller');
    });

    it('should find member by email', async () => {
      const ds = createDatastore({
        members: [createMember('m1', 'John Doe', { email: 'john.doe@example.com' })]
      });
      await service.buildIndex(ds);
      
      const results = service.search('john.doe@example');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entityId).toBe('m1');
    });

    it('should respect limit parameter', async () => {
      const ds = createDatastore({
        topics: [
          createTopic('t1', 'Test Topic 1'),
          createTopic('t2', 'Test Topic 2'),
          createTopic('t3', 'Test Topic 3'),
          createTopic('t4', 'Test Topic 4'),
          createTopic('t5', 'Test Topic 5')
        ]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Test', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return results sorted by relevance (best first)', async () => {
      const ds = createDatastore({
        topics: [
          createTopic('t1', 'Something Else', { description: 'Contains vacation mention' }),
          createTopic('t2', 'Vacation Request'),  // Exact title match should rank higher
          createTopic('t3', 'Other Topic', { searchKeywords: ['vacation'] })
        ]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Vacation');
      expect(results.length).toBeGreaterThan(0);
      
      // The topic with "Vacation" in the title should score higher
      const titleMatch = results.find(r => r.entityId === 't2');
      const descMatch = results.find(r => r.entityId === 't1');
      
      if (titleMatch && descMatch) {
        expect(titleMatch.score).toBeGreaterThan(descMatch.score);
      }
    });

    it('should handle fuzzy/partial matches', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Urlaubsantrag')]
      });
      await service.buildIndex(ds);
      
      // Forward tokenization should match prefix
      const results = service.search('Urlaub');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle German umlauts', async () => {
      const ds = createDatastore({
        topics: [createTopic('t1', 'Gehaltserhöhung')]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Gehalt');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results with correct structure', async () => {
      const ds = createDatastore({
        topics: [createTopic('test-uuid', 'Test Topic')]
      });
      await service.buildIndex(ds);
      
      const results = service.search('Test');
      expect(results.length).toBeGreaterThan(0);
      
      const hit = results[0];
      expect(hit).toHaveProperty('id');
      expect(hit).toHaveProperty('kind');
      expect(hit).toHaveProperty('score');
      expect(hit).toHaveProperty('title');
      expect(hit).toHaveProperty('entityId');
      expect(hit.id).toBe('topic:test-uuid');
      expect(hit.kind).toBe('topic');
      expect(hit.entityId).toBe('test-uuid');
      expect(typeof hit.score).toBe('number');
    });
  });

  describe('Index metadata', () => {
    it('should return null when no metadata stored', () => {
      expect(service.getIndexMeta()).toBeNull();
    });

    it('should store and retrieve index metadata', () => {
      const checksum = 'abc123def456';
      service.setIndexMeta(checksum);
      
      const meta = service.getIndexMeta();
      expect(meta).not.toBeNull();
      expect(meta!.checksum).toBe(checksum);
      expect(meta!.builtAt).toBeTruthy();
      expect(meta!.flexVersion).toBe('0.8.212');
    });

    it('should overwrite previous metadata', () => {
      service.setIndexMeta('first-checksum');
      service.setIndexMeta('second-checksum');
      
      const meta = service.getIndexMeta();
      expect(meta!.checksum).toBe('second-checksum');
    });
  });
});
