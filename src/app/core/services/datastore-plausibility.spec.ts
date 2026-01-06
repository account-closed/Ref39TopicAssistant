import { describe, it, expect } from 'vitest';
import {
  removeInvalidTagReferences,
  removeInvalidMemberReferences,
  validateTopicFields,
  validateMemberColors,
  validateTagColors,
  runPlausibilityChecks,
} from './datastore-plausibility';
import { Datastore, Topic, TeamMember, Tag, TShirtSize } from '../models';

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
    expect(result.correctedTopicFields).toBe(0);
    expect(result.correctedMemberColors).toBe(0);
    expect(result.correctedTagColors).toBe(0);
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
    expect(result.correctedTopicFields).toBe(0);
    expect(result.correctedMemberColors).toBe(0);
    expect(result.correctedTagColors).toBe(0);
  });
});

describe('validateTopicFields', () => {
  it('should not modify topics with valid priority and size', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          priority: 5,
          size: 'M' as TShirtSize,
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(0);
    expect(result.datastore.topics[0].priority).toBe(5);
    expect(result.datastore.topics[0].size).toBe('M');
    expect(result.changeLog).toHaveLength(0);
  });

  it('should remove invalid priority values', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          priority: 15, // Invalid: > 10
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.topics[0].priority).toBeUndefined();
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('priority');
  });

  it('should remove priority values less than 1', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          priority: 0, // Invalid: < 1
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.topics[0].priority).toBeUndefined();
  });

  it('should remove invalid size values', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          size: 'XXXL' as TShirtSize, // Invalid size
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.topics[0].size).toBeUndefined();
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('size');
  });

  it('should accept all valid T-shirt sizes', () => {
    const validSizes: TShirtSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
    
    validSizes.forEach((size) => {
      const datastore = createDatastore({
        topics: [
          createTopic('topic-1', 'Test Topic', 'member-1', { size }),
        ],
      });

      const result = validateTopicFields(datastore);
      expect(result.correctedCount).toBe(0);
      expect(result.datastore.topics[0].size).toBe(size);
    });
  });

  it('should clear fileNumber when hasFileNumber is false', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          hasFileNumber: false,
          fileNumber: 'AZ-123-456', // Should be cleared
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.topics[0].fileNumber).toBe('');
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('fileNumber');
  });

  it('should clear sharedFilePath when hasSharedFilePath is false', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          hasSharedFilePath: false,
          sharedFilePath: '\\\\server\\share', // Should be cleared
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.topics[0].sharedFilePath).toBe('');
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('sharedFilePath');
  });

  it('should keep fileNumber when hasFileNumber is true', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          hasFileNumber: true,
          fileNumber: 'AZ-123-456',
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(0);
    expect(result.datastore.topics[0].fileNumber).toBe('AZ-123-456');
  });

  it('should keep sharedFilePath when hasSharedFilePath is true', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          hasSharedFilePath: true,
          sharedFilePath: '\\\\server\\share',
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(0);
    expect(result.datastore.topics[0].sharedFilePath).toBe('\\\\server\\share');
  });

  it('should handle multiple corrections in one topic', () => {
    const datastore = createDatastore({
      topics: [
        createTopic('topic-1', 'Test Topic', 'member-1', {
          priority: 100, // Invalid
          size: 'MEGA' as TShirtSize, // Invalid
          hasFileNumber: false,
          fileNumber: 'should-clear',
        }),
      ],
    });

    const result = validateTopicFields(datastore);

    expect(result.correctedCount).toBe(3);
    expect(result.datastore.topics[0].priority).toBeUndefined();
    expect(result.datastore.topics[0].size).toBeUndefined();
    expect(result.datastore.topics[0].fileNumber).toBe('');
  });
});

describe('validateMemberColors', () => {
  it('should not modify members with valid colors', () => {
    const datastore = createDatastore({
      members: [
        { ...createMember('member-1', 'User 1'), color: '#FF5733' },
        { ...createMember('member-2', 'User 2'), color: '#00FF00' },
      ],
    });

    const result = validateMemberColors(datastore);

    expect(result.correctedCount).toBe(0);
    expect(result.datastore.members[0].color).toBe('#FF5733');
    expect(result.datastore.members[1].color).toBe('#00FF00');
    expect(result.changeLog).toHaveLength(0);
  });

  it('should remove invalid color values', () => {
    const datastore = createDatastore({
      members: [
        { ...createMember('member-1', 'User 1'), color: 'not-a-color' },
      ],
    });

    const result = validateMemberColors(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.members[0].color).toBeUndefined();
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('invalid color');
  });

  it('should normalize colors without # prefix', () => {
    const datastore = createDatastore({
      members: [
        { ...createMember('member-1', 'User 1'), color: 'FF5733' },
      ],
    });

    const result = validateMemberColors(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.members[0].color).toBe('#FF5733');
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('normalized');
  });

  it('should handle members without colors', () => {
    const datastore = createDatastore({
      members: [createMember('member-1', 'User 1')],
    });

    const result = validateMemberColors(datastore);

    expect(result.correctedCount).toBe(0);
    expect(result.datastore.members[0].color).toBeUndefined();
  });
});

describe('validateTagColors', () => {
  it('should not modify tags with valid colors', () => {
    const datastore = createDatastore({
      tags: [
        { ...createTag('tag-1', 'tag1'), color: '#FF5733' },
        { ...createTag('tag-2', 'tag2'), color: '#00FF00' },
      ],
    });

    const result = validateTagColors(datastore);

    expect(result.correctedCount).toBe(0);
    expect(result.datastore.tags![0].color).toBe('#FF5733');
    expect(result.datastore.tags![1].color).toBe('#00FF00');
    expect(result.changeLog).toHaveLength(0);
  });

  it('should remove invalid color values', () => {
    const datastore = createDatastore({
      tags: [
        { ...createTag('tag-1', 'tag1'), color: 'invalid-color' },
      ],
    });

    const result = validateTagColors(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.tags![0].color).toBeUndefined();
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('invalid color');
  });

  it('should normalize colors without # prefix', () => {
    const datastore = createDatastore({
      tags: [
        { ...createTag('tag-1', 'tag1'), color: 'ABC123' },
      ],
    });

    const result = validateTagColors(datastore);

    expect(result.correctedCount).toBe(1);
    expect(result.datastore.tags![0].color).toBe('#ABC123');
    expect(result.changeLog).toHaveLength(1);
    expect(result.changeLog[0]).toContain('normalized');
  });

  it('should handle empty tags array', () => {
    const datastore = createDatastore({
      tags: [],
    });

    const result = validateTagColors(datastore);

    expect(result.correctedCount).toBe(0);
  });

  it('should handle undefined tags', () => {
    const datastore: Datastore = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      revisionId: 1,
      members: [],
      topics: [],
    };

    const result = validateTagColors(datastore);

    expect(result.correctedCount).toBe(0);
  });
});
