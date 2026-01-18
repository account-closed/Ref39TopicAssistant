import { Injectable } from '@angular/core';
import { TeamMember, Topic, Tag } from '../models';

/**
 * Role weight constants as defined in the specification.
 */
export const ROLE_WEIGHTS = {
  R1: 3.0,
  R2: 2.0,
  R3: 1.5,
  C: 1.0,
  I: 0.5,
  NONE: 0.0,
} as const;

/**
 * Activity multiplier constants.
 */
export const ACTIVITY_MULTIPLIER = {
  active: 1.0,
  inactive: 2.0,
} as const;

/**
 * System-wide constants for topic complexity calculation.
 */
export const COMPLEXITY_CONSTANTS = {
  /** Weight multiplier for TagWeight contribution */
  ALPHA: 1.0,
  /** Weight multiplier for DependencyCount contribution */
  BETA: 0.25,
} as const;

/**
 * Maximum allowed absolute value for tagWeight before warning.
 */
export const TAG_WEIGHT_MAX_ABSOLUTE = 3.0;

export type RoleType = 'R1' | 'R2' | 'R3' | 'C' | 'I';

/**
 * Represents the role a member has in a specific topic.
 */
export interface MemberTopicRole {
  topicId: string;
  role: RoleType;
}

/**
 * Contribution of a single topic to a member's total load.
 */
export interface TopicContribution {
  topicId: string;
  topicHeader: string;
  role: RoleType;
  roleWeight: number;
  topicComplexity: number;
  tagWeightSum: number;
  dependencyCount: number;
  loadContribution: number;
}

/**
 * Complete load calculation result for a member.
 */
export interface MemberLoadResult {
  memberId: string;
  memberName: string;
  isActive: boolean;
  activityMultiplier: number;
  rawLoad: number;
  totalLoad: number;
  normalizedLoad: number;
  topicContributions: TopicContribution[];
  loadStatus: LoadStatus;
}

/**
 * Load status classification based on normalized load.
 */
export type LoadStatus = 'underutilized' | 'normal' | 'overloaded' | 'unsustainable';

/**
 * Validation warning for data issues.
 */
export interface LoadValidationWarning {
  type: 'tagWeight-invalid' | 'tagWeight-extreme' | 'topic-no-r1' | 'topic-inactive-r1';
  message: string;
  entityId: string;
  entityName: string;
}

/**
 * Complete load calculation output.
 */
export interface LoadCalculationResult {
  memberLoads: MemberLoadResult[];
  medianLoad: number;
  warnings: LoadValidationWarning[];
  calculatedAt: string;
}

/**
 * Cache key components for determining if recalculation is needed.
 */
export interface LoadCacheKey {
  revisionId: number;
}

@Injectable({
  providedIn: 'root',
})
export class LoadCalculationService {
  private cache: {
    key: LoadCacheKey | null;
    result: LoadCalculationResult | null;
  } = { key: null, result: null };

  /**
   * Get the role weight for a given role type.
   */
  getRoleWeight(role: RoleType | null | undefined): number {
    if (!role) return ROLE_WEIGHTS.NONE;
    return ROLE_WEIGHTS[role] ?? ROLE_WEIGHTS.NONE;
  }

  /**
   * Get the activity multiplier for a member.
   */
  getActivityMultiplier(member: TeamMember): number {
    return member.active ? ACTIVITY_MULTIPLIER.active : ACTIVITY_MULTIPLIER.inactive;
  }

  /**
   * Calculate the sum of tag weights for a topic.
   */
  calculateTagWeightSum(topic: Topic, tagsMap: Map<string, Tag>): number {
    if (!topic.tags || topic.tags.length === 0) return 0;

    return topic.tags.reduce((sum, tagName) => {
      const tag = tagsMap.get(tagName);
      const weight = tag?.tagWeight ?? 0;
      return sum + weight;
    }, 0);
  }

  /**
   * Calculate the dependency count for a topic.
   */
  calculateDependencyCount(topic: Topic): number {
    return topic.connections?.length ?? 0;
  }

  /**
   * Calculate topic complexity: c(t) = 1 + α·TagWeight(t) + β·DependencyCount(t)
   */
  calculateTopicComplexity(topic: Topic, tagsMap: Map<string, Tag>): number {
    const tagWeightSum = this.calculateTagWeightSum(topic, tagsMap);
    const dependencyCount = this.calculateDependencyCount(topic);

    return (
      1 + COMPLEXITY_CONSTANTS.ALPHA * tagWeightSum + COMPLEXITY_CONSTANTS.BETA * dependencyCount
    );
  }

  /**
   * Get all roles a member has across all topics.
   */
  getMemberRoles(member: TeamMember, topics: Topic[]): MemberTopicRole[] {
    const roles: MemberTopicRole[] = [];

    for (const topic of topics) {
      if (topic.raci.r1MemberId === member.id) {
        roles.push({ topicId: topic.id, role: 'R1' });
      } else if (topic.raci.r2MemberId === member.id) {
        roles.push({ topicId: topic.id, role: 'R2' });
      } else if (topic.raci.r3MemberId === member.id) {
        roles.push({ topicId: topic.id, role: 'R3' });
      } else if (topic.raci.cMemberIds?.includes(member.id)) {
        roles.push({ topicId: topic.id, role: 'C' });
      } else if (topic.raci.iMemberIds?.includes(member.id)) {
        roles.push({ topicId: topic.id, role: 'I' });
      }
    }

    return roles;
  }

  /**
   * Classify load status based on normalized load.
   */
  classifyLoadStatus(normalizedLoad: number): LoadStatus {
    if (normalizedLoad < 0.5) return 'underutilized';
    if (normalizedLoad <= 1.5) return 'normal';
    if (normalizedLoad <= 2.0) return 'overloaded';
    return 'unsustainable';
  }

  /**
   * Calculate median of an array of numbers.
   */
  calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Run validation checks and collect warnings.
   */
  validateData(
    topics: Topic[],
    members: TeamMember[],
    tags: Tag[]
  ): LoadValidationWarning[] {
    const warnings: LoadValidationWarning[] = [];
    const membersMap = new Map(members.map((m) => [m.id, m]));

    // Check tags
    for (const tag of tags) {
      if (tag.tagWeight !== null && tag.tagWeight !== undefined) {
        // Check for NaN or Infinity
        if (!Number.isFinite(tag.tagWeight)) {
          warnings.push({
            type: 'tagWeight-invalid',
            message: `Tag "${tag.name}" has invalid tagWeight (NaN or Infinity)`,
            entityId: tag.id,
            entityName: tag.name,
          });
        }
        // Check for extreme values
        else if (Math.abs(tag.tagWeight) > TAG_WEIGHT_MAX_ABSOLUTE) {
          warnings.push({
            type: 'tagWeight-extreme',
            message: `Tag "${tag.name}" has extreme tagWeight (${tag.tagWeight}), recommended range is -1.0 to +2.0`,
            entityId: tag.id,
            entityName: tag.name,
          });
        }
      }
    }

    // Check topics
    for (const topic of topics) {
      // Topic without R1
      if (!topic.raci.r1MemberId) {
        warnings.push({
          type: 'topic-no-r1',
          message: `Topic "${topic.header}" has no R1 (main responsible)`,
          entityId: topic.id,
          entityName: topic.header,
        });
      } else {
        // Topic with inactive R1
        const r1Member = membersMap.get(topic.raci.r1MemberId);
        if (r1Member && !r1Member.active) {
          warnings.push({
            type: 'topic-inactive-r1',
            message: `Topic "${topic.header}" has inactive R1 (${r1Member.displayName})`,
            entityId: topic.id,
            entityName: topic.header,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Main calculation method: Calculate load for all members.
   * This is a pure, deterministic function.
   */
  calculateLoad(
    members: TeamMember[],
    topics: Topic[],
    tags: Tag[],
    revisionId: number
  ): LoadCalculationResult {
    // Check cache
    if (
      this.cache.key &&
      this.cache.result &&
      this.cache.key.revisionId === revisionId
    ) {
      return this.cache.result;
    }

    const tagsMap = new Map(tags.map((t) => [t.name, t]));
    const topicsMap = new Map(topics.map((t) => [t.id, t]));

    // Calculate raw loads for each member
    const memberLoads: MemberLoadResult[] = members.map((member) => {
      const roles = this.getMemberRoles(member, topics);
      const activityMultiplier = this.getActivityMultiplier(member);

      const topicContributions: TopicContribution[] = roles.map((role) => {
        const topic = topicsMap.get(role.topicId)!;
        const roleWeight = this.getRoleWeight(role.role);
        const tagWeightSum = this.calculateTagWeightSum(topic, tagsMap);
        const dependencyCount = this.calculateDependencyCount(topic);
        const topicComplexity = this.calculateTopicComplexity(topic, tagsMap);
        const loadContribution = roleWeight * topicComplexity;

        return {
          topicId: topic.id,
          topicHeader: topic.header,
          role: role.role,
          roleWeight,
          topicComplexity,
          tagWeightSum,
          dependencyCount,
          loadContribution,
        };
      });

      const rawLoad = topicContributions.reduce((sum, tc) => sum + tc.loadContribution, 0);
      const totalLoad = activityMultiplier * rawLoad;

      return {
        memberId: member.id,
        memberName: member.displayName,
        isActive: member.active,
        activityMultiplier,
        rawLoad,
        totalLoad,
        normalizedLoad: 0, // Will be calculated after median
        topicContributions,
        loadStatus: 'normal' as LoadStatus, // Will be updated after normalization
      };
    });

    // Calculate median load
    const allLoads = memberLoads.map((ml) => ml.totalLoad);
    const medianLoad = this.calculateMedian(allLoads);

    // Calculate normalized loads and status
    for (const ml of memberLoads) {
      ml.normalizedLoad = medianLoad > 0 ? ml.totalLoad / medianLoad : 0;
      ml.loadStatus = this.classifyLoadStatus(ml.normalizedLoad);
    }

    // Validate data and collect warnings
    const warnings = this.validateData(topics, members, tags);

    const result: LoadCalculationResult = {
      memberLoads,
      medianLoad,
      warnings,
      calculatedAt: new Date().toISOString(),
    };

    // Update cache
    this.cache = {
      key: { revisionId },
      result,
    };

    return result;
  }

  /**
   * Invalidate the cache (force recalculation on next call).
   */
  invalidateCache(): void {
    this.cache = { key: null, result: null };
  }

  /**
   * Get the formula explanation text.
   */
  getFormulaExplanation(): string {
    return `Load is calculated as the sum of responsibility weight multiplied by topic complexity. Topic complexity is influenced by tag weights and dependencies.

Formula:
L(m) = activity(m) × Σ [roleWeight(m,t) × topicComplexity(t)]

Where:
• activity(m) = ${ACTIVITY_MULTIPLIER.active} for active, ${ACTIVITY_MULTIPLIER.inactive} for inactive members
• roleWeight: R1=${ROLE_WEIGHTS.R1}, R2=${ROLE_WEIGHTS.R2}, R3=${ROLE_WEIGHTS.R3}, C=${ROLE_WEIGHTS.C}, I=${ROLE_WEIGHTS.I}
• topicComplexity(t) = 1 + ${COMPLEXITY_CONSTANTS.ALPHA}×TagWeight(t) + ${COMPLEXITY_CONSTANTS.BETA}×DependencyCount(t)
• TagWeight(t) = sum of all tag weights assigned to the topic
• Normalized load = L(m) / median(L(all members))`;
  }
}
