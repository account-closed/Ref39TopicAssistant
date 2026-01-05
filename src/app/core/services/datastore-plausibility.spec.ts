import { describe, it, expect } from 'vitest';
import {
  removeInvalidTagReferences,
  removeInvalidMemberReferences,
  runPlausibilityChecks,
} from './datastore-plausibility';
import { Datastore, Topic, TeamMember, Tag } from '../models';

const createMember = (id: string, name: string): TeamMember => ({
  id,
  displayName: name,
  active: true,
  updatedAt: new Date().toISOString(),
});

const createTag = (id: string, name: string): Tag => ({
  id,
  name,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  createdBy: 'test-user',
});

const createTopic = (id: string, header: string, r1MemberId: string, overrides?: Partial<Topic>): Topic => ({
  id,
  header,
  validity: { alwaysValid: true },
  raci: {
    r1MemberId,
    cMemberIds: [],
    iMemberIds: [],
  },
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createDatastore = (overrides?: Partial<Datastore>): Datastore => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  revisionId: 1,
  members: [],
  topics: [],
  tags: [],
  ...overrides,
});

describe('removeInvalidTagReferences', () => {
  it('should not modify topics if no managed tags exist', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', { tags: ['tag1', 'tag2'] }),
      ],
      tags: [],
    });

    const result = removeInvalidTagReferences(datastore);

    expect(result.removedCount).toBe(0);
    expect(result.datastore.topics[0].tags).toEqual(['tag1', 'tag2']);
    expect(result.changeLog).toHaveLength(0);
  });

  it('should remove tags that do not exist in managed tags', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'Test User')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', { tags: ['valid-tag', 'invalid-tag'] }),
      ],
      tags: [createTag('tag-1', 'valid-tag')],
    });

    const result = removeInvalidTagReferences(datastore);

    expect(result.removedCount).toBe(1);
    expect(result.datastore.topics[0].tags).toEqual(['valid-tag']);
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('invalid-tag');
  });

  it('should handle topics with no tags', () => {
    const datastore = createDatastore({
      topics: [createTopic('topic-1', 'Test Topic', 'member-1')],
      tags: [createTag('tag-1', 'valid-tag')],
    });

    const result = removeInvalidTagReferences(datastore);

    expect(result.removedCount).toBe(0);
    expect(result.datastore.topics[0].tags).toBeUndefined();
  });

  it('should handle multiple topics with invalid tags', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Topic 1', 'member-1', { tags: ['valid', 'invalid1'] }),
        createTopic('topic-2', 'Topic 2', 'member-1', { tags: ['invalid2', 'invalid3'] }),
        createTopic('topic-3', 'Topic 3', 'member-1', { tags: ['valid'] }),
      ],
      tags: [createTag('tag-1', 'valid')],
    });

    const result = removeInvalidTagReferences(datastore);

    expect(result.removedCount).toBe(3);
    expect(result.datastore.topics[0].tags).toEqual(['valid']);
    expect(result.datastore.topics[1].tags).toEqual([]);
    expect(result.datastore.topics[2].tags).toEqual(['valid']);
    expect(result.changeLog).toHaveLength(2);
  });
});

describe('removeInvalidMemberReferences', () => {
  it('should not modify topics if all member references are valid', () => {
    const datastore = createDatastore({
      members: [
        createMember('member-1', 'User 1'),
        createMember('member-2', 'User 2'),
      ],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          raci: {
            r1MemberId: 'member-1',
            r2MemberId: 'member-2',
            cMemberIds: ['member-2'],
            iMemberIds: ['member-1'],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    expect(result.removedCount).toBe(0);
    expect(result.datastore.topics[0].raci.r2MemberId).toBe('member-2');
    expect(result.datastore.topics[0].raci.cMemberIds).toEqual(['member-2']);
    expect(result.changeLog).toHaveLength(0);
  });

  it('should remove invalid r2MemberId', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          raci: {
            r1MemberId: 'member-1',
            r2MemberId: 'invalid-member',
            cMemberIds: [],
            iMemberIds: [],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    expect(result.removedCount).toBe(1);
    expect(result.datastore.topics[0].raci.r2MemberId).toBeUndefined();
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('r2MemberId');
  });

  it('should remove invalid r3MemberId', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          raci: {
            r1MemberId: 'member-1',
            r3MemberId: 'invalid-member',
            cMemberIds: [],
            iMemberIds: [],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    expect(result.removedCount).toBe(1);
    expect(result.datastore.topics[0].raci.r3MemberId).toBeUndefined();
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('r3MemberId');
  });

  it('should remove invalid cMemberIds', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          raci: {
            r1MemberId: 'member-1',
            cMemberIds: ['member-1', 'invalid-1', 'invalid-2'],
            iMemberIds: [],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    expect(result.removedCount).toBe(2);
    expect(result.datastore.topics[0].raci.cMemberIds).toEqual(['member-1']);
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('cMemberIds');
  });

  it('should remove invalid iMemberIds', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          raci: {
            r1MemberId: 'member-1',
            cMemberIds: [],
            iMemberIds: ['invalid-member'],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    expect(result.removedCount).toBe(1);
    expect(result.datastore.topics[0].raci.iMemberIds).toEqual([]);
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('iMemberIds');
  });

  it('should log invalid r1MemberId but not remove it', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'invalid-r1', {
          raci: {
            r1MemberId: 'invalid-r1',
            cMemberIds: [],
            iMemberIds: [],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    // r1MemberId should not be removed as it's required
    expect(result.datastore.topics[0].raci.r1MemberId).toBe('invalid-r1');
    // But it should be logged
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('r1MemberId');
    expect(result.changeLog[0]).toContain('keeping as required field');
    expect(result.removedCount).toBe(0);
  });

  it('should handle multiple invalid references in one topic', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          raci: {
            r1MemberId: 'member-1',
            r2MemberId: 'invalid-r2',
            r3MemberId: 'invalid-r3',
            cMemberIds: ['invalid-c'],
            iMemberIds: ['invalid-i'],
          },
        }),
      ],
    });

    const result = removeInvalidMemberReferences(datastore);

    expect(result.removedCount).toBe(4);
    expect(result.datastore.topics[0].raci.r2MemberId).toBeUndefined();
    expect(result.datastore.topics[0].raci.r3MemberId).toBeUndefined();
    expect(result.datastore.topics[0].raci.cMemberIds).toEqual([]);
    expect(result.datastore.topics[0].raci.iMemberIds).toEqual([]);
  });
});

describe('runPlausibilityChecks', () => {
  it('should run all plausibility checks and return combined result', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          tags: ['valid-tag', 'invalid-tag'],
          raci: {
            r1MemberId: 'member-1',
            r2MemberId: 'invalid-member',
            cMemberIds: [],
            iMemberIds: [],
          },
        }),
      ],
      tags: [createTag('tag-1', 'valid-tag')],
    });

    const { datastore: cleaned, result } = runPlausibilityChecks(datastore);

    expect(result.hasChanges).toBe(true);
    expect(result.removedTagReferences).toBe(1);
    expect(result.removedMemberReferences).toBe(1);
    expect(result.changeLog).toHaveLength(2);
    expect(cleaned.topics[0].tags).toEqual(['valid-tag']);
    expect(cleaned.topics[0].raci.r2MemberId).toBeUndefined();
  });

  it('should return hasChanges false if no changes needed', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          tags: ['valid-tag'],
          raci: {
            r1MemberId: 'member-1',
            cMemberIds: [],
            iMemberIds: [],
          },
        }),
      ],
      tags: [createTag('tag-1', 'valid-tag')],
    });

    const { result } = runPlausibilityChecks(datastore);

    expect(result.hasChanges).toBe(false);
    expect(result.removedTagReferences).toBe(0);
    expect(result.removedMemberReferences).toBe(0);
    expect(result.changeLog).toHaveLength(0);
  });

  it('should handle empty datastore', () => {
    const datastore = createDatastore({
      members: [],
      topics: [],
      tags: [],
    });

    const { result } = runPlausibilityChecks(datastore);

    expect(result.hasChanges).toBe(false);
    expect(result.removedTagReferences).toBe(0);
    expect(result.removedMemberReferences).toBe(0);
  });
});
