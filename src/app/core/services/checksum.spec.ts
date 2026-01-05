import { describe, it, expect, vi, beforeAll } from 'vitest';
import { canonicalStringify, computeDatastoreChecksum } from './checksum';
import { Datastore } from '../models';

// Mock crypto.subtle for Node.js environment
beforeAll(() => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    const nodeCrypto = require('crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: {
          digest: async (algorithm: string, data: ArrayBuffer) => {
            const hash = nodeCrypto.createHash('sha256');
            hash.update(Buffer.from(data));
            return hash.digest().buffer;
          }
        }
      }
    });
  }
});

describe('canonicalStringify', () => {
  it('should sort object keys alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const result = canonicalStringify(obj, new Set());
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should sort nested object keys recursively', () => {
    const obj = { b: { z: 1, a: 2 }, a: { y: 3, x: 4 } };
    const result = canonicalStringify(obj, new Set());
    expect(result).toBe('{"a":{"x":4,"y":3},"b":{"a":2,"z":1}}');
  });

  it('should preserve array order (not sort arrays)', () => {
    const obj = { items: ['z', 'a', 'm'] };
    const result = canonicalStringify(obj, new Set());
    expect(result).toBe('{"items":["z","a","m"]}');
  });

  it('should exclude specified fields', () => {
    const obj = { a: 1, excluded: 2, b: 3 };
    const result = canonicalStringify(obj, new Set(['excluded']));
    expect(result).toBe('{"a":1,"b":3}');
  });

  it('should exclude generatedAt and revisionId by default', () => {
    const obj = { 
      schemaVersion: 1, 
      generatedAt: '2024-01-01', 
      revisionId: 123,
      members: []
    };
    const result = canonicalStringify(obj);
    expect(result).toBe('{"members":[],"schemaVersion":1}');
    expect(result).not.toContain('generatedAt');
    expect(result).not.toContain('revisionId');
  });

  it('should handle null values', () => {
    const obj = { a: null, b: 1 };
    const result = canonicalStringify(obj, new Set());
    expect(result).toBe('{"a":null,"b":1}');
  });

  it('should handle nested arrays of objects', () => {
    const obj = { 
      items: [
        { z: 1, a: 2 },
        { y: 3, b: 4 }
      ]
    };
    const result = canonicalStringify(obj, new Set());
    expect(result).toBe('{"items":[{"a":2,"z":1},{"b":4,"y":3}]}');
  });

  it('should produce same output regardless of initial key order', () => {
    const obj1 = { c: 3, a: 1, b: 2 };
    const obj2 = { a: 1, b: 2, c: 3 };
    const obj3 = { b: 2, c: 3, a: 1 };
    
    const result1 = canonicalStringify(obj1, new Set());
    const result2 = canonicalStringify(obj2, new Set());
    const result3 = canonicalStringify(obj3, new Set());
    
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

describe('computeDatastoreChecksum', () => {
  const createDatastore = (overrides: Partial<Datastore> = {}): Datastore => ({
    schemaVersion: 1,
    generatedAt: '2024-01-01T00:00:00Z',
    revisionId: 1,
    members: [],
    topics: [],
    tags: [],
    ...overrides
  });

  it('should return a 64-character hex string (SHA-256)', async () => {
    const ds = createDatastore();
    const checksum = await computeDatastoreChecksum(ds);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce same checksum for identical content', async () => {
    const ds1 = createDatastore();
    const ds2 = createDatastore();
    
    const checksum1 = await computeDatastoreChecksum(ds1);
    const checksum2 = await computeDatastoreChecksum(ds2);
    
    expect(checksum1).toBe(checksum2);
  });

  it('should produce same checksum regardless of generatedAt', async () => {
    const ds1 = createDatastore({ generatedAt: '2024-01-01T00:00:00Z' });
    const ds2 = createDatastore({ generatedAt: '2024-12-31T23:59:59Z' });
    
    const checksum1 = await computeDatastoreChecksum(ds1);
    const checksum2 = await computeDatastoreChecksum(ds2);
    
    expect(checksum1).toBe(checksum2);
  });

  it('should produce same checksum regardless of revisionId', async () => {
    const ds1 = createDatastore({ revisionId: 1 });
    const ds2 = createDatastore({ revisionId: 999 });
    
    const checksum1 = await computeDatastoreChecksum(ds1);
    const checksum2 = await computeDatastoreChecksum(ds2);
    
    expect(checksum1).toBe(checksum2);
  });

  it('should produce different checksum when content changes', async () => {
    const ds1 = createDatastore({ schemaVersion: 1 });
    const ds2 = createDatastore({ schemaVersion: 2 });
    
    const checksum1 = await computeDatastoreChecksum(ds1);
    const checksum2 = await computeDatastoreChecksum(ds2);
    
    expect(checksum1).not.toBe(checksum2);
  });

  it('should produce different checksum when members change', async () => {
    const ds1 = createDatastore({ members: [] });
    const ds2 = createDatastore({ 
      members: [{ 
        id: 'member-1', 
        displayName: 'Test User',
        active: true,
        updatedAt: '2024-01-01T00:00:00Z'
      }] 
    });
    
    const checksum1 = await computeDatastoreChecksum(ds1);
    const checksum2 = await computeDatastoreChecksum(ds2);
    
    expect(checksum1).not.toBe(checksum2);
  });

  it('should produce different checksum when topics change', async () => {
    const ds1 = createDatastore({ topics: [] });
    const ds2 = createDatastore({ 
      topics: [{ 
        id: 'topic-1',
        header: 'Test Topic',
        validity: { alwaysValid: true },
        raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] },
        updatedAt: '2024-01-01T00:00:00Z'
      }] 
    });
    
    const checksum1 = await computeDatastoreChecksum(ds1);
    const checksum2 = await computeDatastoreChecksum(ds2);
    
    expect(checksum1).not.toBe(checksum2);
  });

  it('should be stable across reloads (deterministic)', async () => {
    const ds = createDatastore({
      members: [
        { id: 'b', displayName: 'User B', active: true, updatedAt: '2024-01-01' },
        { id: 'a', displayName: 'User A', active: true, updatedAt: '2024-01-01' }
      ],
      topics: [
        { 
          id: 'topic-1', 
          header: 'Topic', 
          validity: { alwaysValid: true },
          raci: { r1MemberId: 'a', cMemberIds: [], iMemberIds: [] },
          updatedAt: '2024-01-01'
        }
      ]
    });
    
    const checksum1 = await computeDatastoreChecksum(ds);
    const checksum2 = await computeDatastoreChecksum(ds);
    const checksum3 = await computeDatastoreChecksum(ds);
    
    expect(checksum1).toBe(checksum2);
    expect(checksum2).toBe(checksum3);
  });
});
