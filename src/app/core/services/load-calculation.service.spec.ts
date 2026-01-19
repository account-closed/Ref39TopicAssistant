import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  LoadCalculationService,
  ROLE_WEIGHTS,
  ACTIVITY_MULTIPLIER,
  COMPLEXITY_CONSTANTS,
  TAG_WEIGHT_MAX_ABSOLUTE,
} from './load-calculation.service';
import { LoadConfigService } from './load-config.service';
import { TeamMember, Topic, Tag, LoadConfig, DEFAULT_LOAD_CONFIG } from '../models';

// Mock LoadConfigService
const mockLoadConfigService = {
  getConfig: vi.fn(() => null as LoadConfig | null),
  config$: { subscribe: vi.fn() },
  getDefaultBaseLoad: vi.fn((config: LoadConfig) => {
    return config?.baseLoad?.components
      ?.filter((c: { enabled: boolean }) => c.enabled)
      ?.reduce((sum: number, c: { hoursPerWeek: number }) => sum + c.hoursPerWeek, 0) ?? 3.5;
  }),
  classifySize: vi.fn((config: LoadConfig, totalLoad: number, effectiveCapacity: number) => {
    if (totalLoad > effectiveCapacity) return 'XXL';
    if (totalLoad >= 20) return 'XL';
    if (totalLoad >= 14) return 'L';
    if (totalLoad >= 8) return 'M';
    if (totalLoad >= 2) return 'S';
    return 'XS';
  }),
};

describe('LoadCalculationService', () => {
  let service: LoadCalculationService;

  // Helper functions to create test data
  const createMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
    id: 'member-1',
    displayName: 'Test Member',
    active: true,
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const createTopic = (overrides: Partial<Topic> = {}): Topic => ({
    id: 'topic-1',
    header: 'Test Topic',
    validity: { alwaysValid: true },
    raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] },
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const createTag = (overrides: Partial<Tag> = {}): Tag => ({
    id: 'tag-1',
    name: 'test-tag',
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    createdBy: 'member-1',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        LoadCalculationService,
        { provide: LoadConfigService, useValue: mockLoadConfigService }
      ]
    });
    service = TestBed.inject(LoadCalculationService);
    service.invalidateCache();
  });

  describe('getRoleWeight', () => {
    it('should return correct weight for R1 from hardcoded constants', () => {
      expect(service.getRoleWeight('R1')).toBe(ROLE_WEIGHTS.R1);
      expect(service.getRoleWeight('R1')).toBe(3.0);
    });

    it('should return correct weight for R2 from hardcoded constants', () => {
      expect(service.getRoleWeight('R2')).toBe(ROLE_WEIGHTS.R2);
      expect(service.getRoleWeight('R2')).toBe(2.0);
    });

    it('should return correct weight for R3 from hardcoded constants', () => {
      expect(service.getRoleWeight('R3')).toBe(ROLE_WEIGHTS.R3);
      expect(service.getRoleWeight('R3')).toBe(1.5);
    });

    it('should return correct weight for C from hardcoded constants', () => {
      expect(service.getRoleWeight('C')).toBe(ROLE_WEIGHTS.C);
      expect(service.getRoleWeight('C')).toBe(1.0);
    });

    it('should return correct weight for I from hardcoded constants', () => {
      expect(service.getRoleWeight('I')).toBe(ROLE_WEIGHTS.I);
      expect(service.getRoleWeight('I')).toBe(0.5);
    });

    it('should return 0 for null or undefined', () => {
      expect(service.getRoleWeight(null)).toBe(0);
      expect(service.getRoleWeight(undefined)).toBe(0);
    });
    
    it('should use config role weights when provided', () => {
      const config: LoadConfig = {
        ...DEFAULT_LOAD_CONFIG,
        roleWeights: {
          R1: 5.0,
          R2: 3.0,
          R3: 2.5,
          C: 1.5,
          I: 0.75,
        },
      };
      
      expect(service.getRoleWeight('R1', config)).toBe(5.0);
      expect(service.getRoleWeight('R2', config)).toBe(3.0);
      expect(service.getRoleWeight('R3', config)).toBe(2.5);
      expect(service.getRoleWeight('C', config)).toBe(1.5);
      expect(service.getRoleWeight('I', config)).toBe(0.75);
    });
    
    it('should fall back to hardcoded constants when config is null', () => {
      expect(service.getRoleWeight('R1', null)).toBe(3.0);
      expect(service.getRoleWeight('R2', null)).toBe(2.0);
    });
    
    it('should handle zero weight from config correctly', () => {
      const config: LoadConfig = {
        ...DEFAULT_LOAD_CONFIG,
        roleWeights: {
          R1: 0,  // Explicitly set to 0
          R2: 2.0,
          R3: 1.5,
          C: 1.0,
          I: 0.5,
        },
      };
      
      // Should return 0, not fall back to default
      expect(service.getRoleWeight('R1', config)).toBe(0);
    });
  });

  describe('getActivityMultiplier', () => {
    it('should return 1.0 for active members', () => {
      const member = createMember({ active: true });
      expect(service.getActivityMultiplier(member)).toBe(1.0);
    });

    it('should return 2.0 for inactive members', () => {
      const member = createMember({ active: false });
      expect(service.getActivityMultiplier(member)).toBe(2.0);
    });
  });

  describe('calculateTagWeightSum', () => {
    it('should return 0 for topic with no tags', () => {
      const topic = createTopic({ tags: [] });
      const tagsMap = new Map<string, Tag>();
      expect(service.calculateTagWeightSum(topic, tagsMap)).toBe(0);
    });

    it('should return 0 for topic with tags that have no weight (neutral)', () => {
      const topic = createTopic({ tags: ['tag1', 'tag2'] });
      const tagsMap = new Map<string, Tag>([
        ['tag1', createTag({ name: 'tag1', tagWeight: null })],
        ['tag2', createTag({ name: 'tag2', tagWeight: undefined })],
      ]);
      expect(service.calculateTagWeightSum(topic, tagsMap)).toBe(0);
    });

    it('should sum tag weights correctly', () => {
      const topic = createTopic({ tags: ['tag1', 'tag2', 'tag3'] });
      const tagsMap = new Map<string, Tag>([
        ['tag1', createTag({ name: 'tag1', tagWeight: 1.0 })],
        ['tag2', createTag({ name: 'tag2', tagWeight: 0.5 })],
        ['tag3', createTag({ name: 'tag3', tagWeight: -0.5 })],
      ]);
      expect(service.calculateTagWeightSum(topic, tagsMap)).toBe(1.0);
    });

    it('should handle missing tags in map as weight 0', () => {
      const topic = createTopic({ tags: ['existing', 'missing'] });
      const tagsMap = new Map<string, Tag>([
        ['existing', createTag({ name: 'existing', tagWeight: 2.0 })],
      ]);
      expect(service.calculateTagWeightSum(topic, tagsMap)).toBe(2.0);
    });
  });

  describe('calculateDependencyCount', () => {
    it('should return 0 for topic with no connections', () => {
      const topic = createTopic({ connections: undefined });
      expect(service.calculateDependencyCount(topic)).toBe(0);
    });

    it('should return correct count for topic with connections', () => {
      const topic = createTopic({
        connections: [
          { targetTopicId: 'topic-2', type: 'dependsOn' },
          { targetTopicId: 'topic-3', type: 'relatedTo' },
          { targetTopicId: 'topic-4', type: 'blocks' },
        ],
      });
      expect(service.calculateDependencyCount(topic)).toBe(3);
    });
  });

  describe('calculateTopicComplexity', () => {
    const ALPHA = 1.0;
    const BETA = 0.25;

    it('should return 1.0 for topic with no tags and no connections', () => {
      const topic = createTopic({ tags: [], connections: [] });
      const tagsMap = new Map<string, Tag>();
      expect(service.calculateTopicComplexity(topic, tagsMap, ALPHA, BETA)).toBe(1.0);
    });

    it('should calculate complexity correctly with tag weights', () => {
      const topic = createTopic({ tags: ['tag1'], connections: [] });
      const tagsMap = new Map<string, Tag>([
        ['tag1', createTag({ name: 'tag1', tagWeight: 2.0 })],
      ]);
      // c(t) = 1 + 1.0 * 2.0 + 0.25 * 0 = 3.0
      expect(service.calculateTopicComplexity(topic, tagsMap, ALPHA, BETA)).toBe(3.0);
    });

    it('should calculate complexity correctly with connections', () => {
      const topic = createTopic({
        tags: [],
        connections: [
          { targetTopicId: 'topic-2', type: 'dependsOn' },
          { targetTopicId: 'topic-3', type: 'relatedTo' },
        ],
      });
      const tagsMap = new Map<string, Tag>();
      // c(t) = 1 + 1.0 * 0 + 0.25 * 2 = 1.5
      expect(service.calculateTopicComplexity(topic, tagsMap, ALPHA, BETA)).toBe(1.5);
    });

    it('should calculate complexity correctly with both tags and connections', () => {
      const topic = createTopic({
        tags: ['tag1'],
        connections: [{ targetTopicId: 'topic-2', type: 'dependsOn' }],
      });
      const tagsMap = new Map<string, Tag>([
        ['tag1', createTag({ name: 'tag1', tagWeight: 1.5 })],
      ]);
      // c(t) = 1 + 1.0 * 1.5 + 0.25 * 1 = 2.75
      expect(service.calculateTopicComplexity(topic, tagsMap, ALPHA, BETA)).toBe(2.75);
    });

    it('should handle negative tag weights', () => {
      const topic = createTopic({ tags: ['tag1'], connections: [] });
      const tagsMap = new Map<string, Tag>([
        ['tag1', createTag({ name: 'tag1', tagWeight: -1.0 })],
      ]);
      // c(t) = 1 + 1.0 * (-1.0) + 0.25 * 0 = 0.0
      expect(service.calculateTopicComplexity(topic, tagsMap, ALPHA, BETA)).toBe(0.0);
    });
  });

  describe('getMemberRoles', () => {
    it('should identify R1 role', () => {
      const member = createMember({ id: 'member-1' });
      const topics = [createTopic({ raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } })];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe('R1');
    });

    it('should identify R2 role', () => {
      const member = createMember({ id: 'member-2' });
      const topics = [
        createTopic({
          raci: { r1MemberId: 'member-1', r2MemberId: 'member-2', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe('R2');
    });

    it('should identify R3 role', () => {
      const member = createMember({ id: 'member-3' });
      const topics = [
        createTopic({
          raci: { r1MemberId: 'member-1', r3MemberId: 'member-3', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe('R3');
    });

    it('should identify C role', () => {
      const member = createMember({ id: 'member-c' });
      const topics = [
        createTopic({
          raci: { r1MemberId: 'member-1', cMemberIds: ['member-c'], iMemberIds: [] },
        }),
      ];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe('C');
    });

    it('should identify I role', () => {
      const member = createMember({ id: 'member-i' });
      const topics = [
        createTopic({
          raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: ['member-i'] },
        }),
      ];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe('I');
    });

    it('should identify multiple roles across topics', () => {
      const member = createMember({ id: 'member-1' });
      const topics = [
        createTopic({ id: 'topic-1', raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } }),
        createTopic({ id: 'topic-2', raci: { r1MemberId: 'member-2', r2MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } }),
      ];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(2);
      expect(roles.map((r) => r.role)).toContain('R1');
      expect(roles.map((r) => r.role)).toContain('R2');
    });

    it('should return empty array for member with no roles', () => {
      const member = createMember({ id: 'member-no-role' });
      const topics = [createTopic({ raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } })];
      const roles = service.getMemberRoles(member, topics);
      expect(roles).toHaveLength(0);
    });
  });

  describe('classifyLoadStatus', () => {
    // Now uses capacity ratio (0-1 scale where 1.0 = full capacity)
    it('should classify < 0.3 as underutilized', () => {
      expect(service.classifyLoadStatus(0)).toBe('underutilized');
      expect(service.classifyLoadStatus(0.29)).toBe('underutilized');
    });

    it('should classify 0.3 - 0.9 as normal', () => {
      expect(service.classifyLoadStatus(0.3)).toBe('normal');
      expect(service.classifyLoadStatus(0.5)).toBe('normal');
      expect(service.classifyLoadStatus(0.9)).toBe('normal');
    });

    it('should classify > 0.9 and <= 1.0 as overloaded', () => {
      expect(service.classifyLoadStatus(0.91)).toBe('overloaded');
      expect(service.classifyLoadStatus(1.0)).toBe('overloaded');
    });

    it('should classify > 1.0 as unsustainable', () => {
      expect(service.classifyLoadStatus(1.01)).toBe('unsustainable');
      expect(service.classifyLoadStatus(2.0)).toBe('unsustainable');
    });
  });

  describe('calculateMedian', () => {
    it('should return 0 for empty array', () => {
      expect(service.calculateMedian([])).toBe(0);
    });

    it('should return single value for single element', () => {
      expect(service.calculateMedian([5])).toBe(5);
    });

    it('should calculate median for odd number of elements', () => {
      expect(service.calculateMedian([1, 3, 5])).toBe(3);
      expect(service.calculateMedian([5, 1, 3])).toBe(3); // Order shouldn't matter
    });

    it('should calculate median for even number of elements', () => {
      expect(service.calculateMedian([1, 2, 3, 4])).toBe(2.5);
      expect(service.calculateMedian([1, 3])).toBe(2);
    });
  });

  describe('validateData', () => {
    it('should warn about NaN tagWeight', () => {
      const tags = [createTag({ name: 'bad-tag', tagWeight: NaN })];
      const warnings = service.validateData([], [], tags);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('tagWeight-invalid');
    });

    it('should warn about Infinity tagWeight', () => {
      const tags = [createTag({ name: 'bad-tag', tagWeight: Infinity })];
      const warnings = service.validateData([], [], tags);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('tagWeight-invalid');
    });

    it('should warn about extreme tagWeight values', () => {
      const tags = [createTag({ name: 'extreme-tag', tagWeight: 5.0 })];
      const warnings = service.validateData([], [], tags);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('tagWeight-extreme');
    });

    it('should not warn about tagWeight within range', () => {
      const tags = [
        createTag({ name: 'tag1', tagWeight: 2.0 }),
        createTag({ name: 'tag2', tagWeight: -1.0 }),
      ];
      const warnings = service.validateData([], [], tags);
      expect(warnings).toHaveLength(0);
    });

    it('should warn about topic without R1', () => {
      const topics = [
        createTopic({
          header: 'No R1 Topic',
          raci: { r1MemberId: '', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const warnings = service.validateData(topics, [], []);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('topic-no-r1');
    });

    it('should warn about topic with inactive R1', () => {
      const members = [createMember({ id: 'inactive-member', active: false, displayName: 'Inactive' })];
      const topics = [
        createTopic({
          header: 'Inactive R1 Topic',
          raci: { r1MemberId: 'inactive-member', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const warnings = service.validateData(topics, members, []);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('topic-inactive-r1');
    });
  });

  describe('calculateLoad', () => {
    it('should calculate load for member with single R1 topic', () => {
      const members = [createMember({ id: 'member-1' })];
      const topics = [createTopic({ raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } })];
      const tags: Tag[] = [];

      const result = service.calculateLoad(members, topics, tags, 1);

      expect(result.memberLoads).toHaveLength(1);
      const ml = result.memberLoads[0];
      expect(ml.memberId).toBe('member-1');
      // topicsLoad = 1.0 (activity) * (3.0 (R1) * 1.0 (complexity)) = 3.0
      // totalLoad = baseLoad (3.5) + topicsLoad (3.0) = 6.5
      expect(ml.topicsLoad).toBe(3.0);
      expect(ml.baseLoadHoursPerWeek).toBe(3.5);
      expect(ml.totalLoad).toBe(6.5);
    });

    it('should double topic load for inactive member', () => {
      const members = [createMember({ id: 'member-1', active: false })];
      const topics = [createTopic({ raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } })];
      const tags: Tag[] = [];

      const result = service.calculateLoad(members, topics, tags, 1);

      const ml = result.memberLoads[0];
      expect(ml.activityMultiplier).toBe(2.0);
      // topicsLoad = 2.0 (activity) * (3.0 (R1) * 1.0 (complexity)) = 6.0
      // totalLoad = baseLoad (3.5) + topicsLoad (6.0) = 9.5
      expect(ml.topicsLoad).toBe(6.0);
      expect(ml.totalLoad).toBe(9.5);
    });

    it('should include tag weight in complexity calculation', () => {
      const members = [createMember({ id: 'member-1' })];
      const topics = [
        createTopic({
          tags: ['heavy-tag'],
          raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const tags = [createTag({ name: 'heavy-tag', tagWeight: 2.0 })];

      const result = service.calculateLoad(members, topics, tags, 1);

      const ml = result.memberLoads[0];
      // Complexity = 1 + 1.0 * 2.0 = 3.0
      // topicsLoad = 1.0 * (3.0 * 3.0) = 9.0
      // totalLoad = baseLoad (3.5) + topicsLoad (9.0) = 12.5
      expect(ml.topicContributions[0].topicComplexity).toBe(3.0);
      expect(ml.topicsLoad).toBe(9.0);
      expect(ml.totalLoad).toBe(12.5);
    });

    it('should include dependencies in complexity calculation', () => {
      const members = [createMember({ id: 'member-1' })];
      const topics = [
        createTopic({
          connections: [
            { targetTopicId: 'topic-2', type: 'dependsOn' },
            { targetTopicId: 'topic-3', type: 'dependsOn' },
          ],
          raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const tags: Tag[] = [];

      const result = service.calculateLoad(members, topics, tags, 1);

      const ml = result.memberLoads[0];
      // Complexity = 1 + 0.25 * 2 = 1.5
      // topicsLoad = 1.0 * (3.0 * 1.5) = 4.5
      // totalLoad = baseLoad (3.5) + topicsLoad (4.5) = 8.0
      expect(ml.topicContributions[0].topicComplexity).toBe(1.5);
      expect(ml.topicsLoad).toBe(4.5);
      expect(ml.totalLoad).toBe(8.0);
    });

    it('should calculate normalized load based on median', () => {
      const members = [
        createMember({ id: 'member-1', displayName: 'Low Load' }),
        createMember({ id: 'member-2', displayName: 'Medium Load' }),
        createMember({ id: 'member-3', displayName: 'High Load' }),
      ];
      const topics = [
        createTopic({ id: 'topic-1', raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } }),
        createTopic({ id: 'topic-2', raci: { r1MemberId: 'member-2', cMemberIds: [], iMemberIds: [] } }),
        createTopic({ id: 'topic-3', raci: { r1MemberId: 'member-2', cMemberIds: [], iMemberIds: [] } }),
        createTopic({ id: 'topic-4', raci: { r1MemberId: 'member-3', cMemberIds: [], iMemberIds: [] } }),
        createTopic({ id: 'topic-5', raci: { r1MemberId: 'member-3', cMemberIds: [], iMemberIds: [] } }),
        createTopic({ id: 'topic-6', raci: { r1MemberId: 'member-3', cMemberIds: [], iMemberIds: [] } }),
      ];
      const tags: Tag[] = [];

      const result = service.calculateLoad(members, topics, tags, 1);

      // member-1: baseLoad (3.5) + topicsLoad (3.0 = 1 topic) = 6.5
      // member-2: baseLoad (3.5) + topicsLoad (6.0 = 2 topics) = 9.5
      // member-3: baseLoad (3.5) + topicsLoad (9.0 = 3 topics) = 12.5
      // Median = 9.5
      expect(result.medianLoad).toBe(9.5);
      
      const ml1 = result.memberLoads.find((m) => m.memberId === 'member-1')!;
      const ml2 = result.memberLoads.find((m) => m.memberId === 'member-2')!;
      const ml3 = result.memberLoads.find((m) => m.memberId === 'member-3')!;

      // Normalized = totalLoad / median
      expect(ml1.normalizedLoad).toBeCloseTo(6.5 / 9.5, 5);
      expect(ml2.normalizedLoad).toBeCloseTo(9.5 / 9.5, 5);
      expect(ml3.normalizedLoad).toBeCloseTo(12.5 / 9.5, 5);
    });

    it('should correctly classify load status based on capacity ratio', () => {
      const members = [
        createMember({ id: 'member-1', displayName: 'Test' }),
      ];
      const topics = [
        createTopic({ id: 't1', raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } }),
      ];

      const result = service.calculateLoad(members, topics, [], 1);

      // totalLoad = 3.5 + 3.0 = 6.5
      // effectiveCapacity = 41 * (1 - 0.35) = 26.65
      // capacityRatio = 6.5 / 26.65 ≈ 0.24
      const member = result.memberLoads[0];
      expect(member.totalLoad).toBe(6.5);
      expect(member.effectiveCapacityHoursPerWeek).toBeCloseTo(26.65, 1);
      expect(member.capacityRatio).toBeLessThan(0.3);
      expect(member.loadStatus).toBe('underutilized');
    });

    it('should use cache for same revisionId', () => {
      const members = [createMember()];
      const topics = [createTopic()];

      const result1 = service.calculateLoad(members, topics, [], 1);
      const result2 = service.calculateLoad(members, topics, [], 1);

      // Should be same reference (cached)
      expect(result1).toBe(result2);
    });

    it('should recalculate for different revisionId', () => {
      const members = [createMember()];
      const topics = [createTopic()];

      const result1 = service.calculateLoad(members, topics, [], 1);
      const result2 = service.calculateLoad(members, topics, [], 2);

      // Should be different reference
      expect(result1).not.toBe(result2);
    });

    it('should handle member with no topics (only base load)', () => {
      const members = [createMember({ id: 'no-topics' })];
      const topics: Topic[] = [];

      const result = service.calculateLoad(members, topics, [], 1);

      // Member still has base load (3.5h/week)
      expect(result.memberLoads[0].baseLoadHoursPerWeek).toBe(3.5);
      expect(result.memberLoads[0].topicsLoad).toBe(0);
      expect(result.memberLoads[0].totalLoad).toBe(3.5);
      expect(result.memberLoads[0].topicContributions).toHaveLength(0);
    });

    it('should provide explainable topic contributions', () => {
      const members = [createMember({ id: 'member-1' })];
      const topics = [
        createTopic({
          id: 'topic-1',
          header: 'Important Topic',
          tags: ['complex-tag'],
          connections: [{ targetTopicId: 'topic-2', type: 'dependsOn' }],
          raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] },
        }),
      ];
      const tags = [createTag({ name: 'complex-tag', tagWeight: 1.0 })];

      const result = service.calculateLoad(members, topics, tags, 1);

      const contribution = result.memberLoads[0].topicContributions[0];
      expect(contribution.topicId).toBe('topic-1');
      expect(contribution.topicHeader).toBe('Important Topic');
      expect(contribution.role).toBe('R1');
      expect(contribution.roleWeight).toBe(3.0);
      expect(contribution.tagWeightSum).toBe(1.0);
      expect(contribution.dependencyCount).toBe(1);
      // Complexity = 1 + 1.0 * 1.0 + 0.25 * 1 = 2.25
      expect(contribution.topicComplexity).toBe(2.25);
      // Load contribution = 3.0 * 2.25 = 6.75
      expect(contribution.loadContribution).toBe(6.75);
    });
    
    it('should use configurable role weights when config is provided', () => {
      const config: LoadConfig = {
        ...DEFAULT_LOAD_CONFIG,
        roleWeights: {
          R1: 5.0,  // Custom weight instead of 3.0
          R2: 3.0,
          R3: 2.0,
          C: 1.5,
          I: 1.0,
        },
      };
      
      mockLoadConfigService.getConfig.mockReturnValue(config);
      
      const members = [createMember({ id: 'member-1' })];
      const topics = [createTopic({ raci: { r1MemberId: 'member-1', cMemberIds: [], iMemberIds: [] } })];
      const tags: Tag[] = [];

      const result = service.calculateLoad(members, topics, tags, 1, config);

      const ml = result.memberLoads[0];
      // topicsLoad = 1.0 (activity) * (5.0 (R1 custom) * 1.0 (complexity)) = 5.0
      // totalLoad = baseLoad (3.5) + topicsLoad (5.0) = 8.5
      expect(ml.topicsLoad).toBe(5.0);
      expect(ml.totalLoad).toBe(8.5);
      expect(ml.topicContributions[0].roleWeight).toBe(5.0);
    });
  });

  describe('getFormulaExplanation', () => {
    it('should return formula explanation text', () => {
      // Reset mock to return null so defaults are used
      mockLoadConfigService.getConfig.mockReturnValue(null);
      
      const explanation = service.getFormulaExplanation();
      expect(explanation).toContain('Load is calculated');
      expect(explanation).toContain('R1=3');
      expect(explanation).toContain('R2=2');
      expect(explanation).toContain('R3=1.5');
      expect(explanation).toContain('topicComplexity');
    });
  });
});
