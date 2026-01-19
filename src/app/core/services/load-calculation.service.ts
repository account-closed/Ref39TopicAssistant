import { Injectable, inject } from '@angular/core';
import { TeamMember, Topic, Tag, LoadConfig, SizeLabel } from '../models';
import { LoadConfigService } from './load-config.service';

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
 * These are now configurable via load_config.json but kept as defaults.
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

/**
 * Recommended range for tagWeight values (for UI guidance).
 */
export const TAG_WEIGHT_RECOMMENDED_MIN = -1.0;
export const TAG_WEIGHT_RECOMMENDED_MAX = 2.0;

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
  /** Part-time factor (1.0 = full-time, 0.8 = 80% etc.) */
  partTimeFactor: number;
  rawLoad: number;
  /** Topic-based load (L_topics) */
  topicsLoad: number;
  /** Base load (L_base) in hours/week */
  baseLoadHoursPerWeek: number;
  /** Total load = L_base + L_topics */
  totalLoad: number;
  normalizedLoad: number;
  /** Effective capacity for this member (hours/week) */
  effectiveCapacityHoursPerWeek: number;
  /** Capacity ratio = totalLoad / effectiveCapacity */
  capacityRatio: number;
  /** Size classification (XS/S/M/L/XL/XXL) */
  size: SizeLabel;
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
  type: 'tagWeight-invalid' | 'tagWeight-extreme' | 'topic-no-r1' | 'topic-inactive-r1' | 'config-warning';
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
  /** Effective full-time capacity (hours/week) */
  effectiveFullTimeCapacity: number;
  warnings: LoadValidationWarning[];
  calculatedAt: string;
  /** Alpha value used for topic complexity */
  alpha: number;
  /** Beta value used for topic complexity */
  beta: number;
  /** Default base load (hours/week) */
  defaultBaseLoadHoursPerWeek: number;
  /** Contract hours per week */
  contractHoursPerWeek: number;
  /** Overhead factor */
  overheadFactor: number;
}

/**
 * Cache key components for determining if recalculation is needed.
 */
export interface LoadCacheKey {
  revisionId: number;
  configHash: string;
}

@Injectable({
  providedIn: 'root',
})
export class LoadCalculationService {
  private readonly loadConfigService = inject(LoadConfigService);

  private cache: {
    key: LoadCacheKey | null;
    result: LoadCalculationResult | null;
  } = { key: null, result: null };

  /**
   * Get the role weight for a given role type.
   * Uses config if available, otherwise falls back to ROLE_WEIGHTS constant.
   */
  getRoleWeight(role: RoleType | null | undefined, config?: LoadConfig | null): number {
    if (!role) return 0;
    
    // Use config role weights if available
    if (config?.roleWeights) {
      return config.roleWeights[role] ?? 0;
    }
    
    // Fallback to hardcoded constants
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
  calculateTopicComplexity(
    topic: Topic,
    tagsMap: Map<string, Tag>,
    alpha: number,
    beta: number
  ): number {
    const tagWeightSum = this.calculateTagWeightSum(topic, tagsMap);
    const dependencyCount = this.calculateDependencyCount(topic);

    return 1 + alpha * tagWeightSum + beta * dependencyCount;
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
   * Classify load status based on capacity ratio.
   */
  classifyLoadStatus(capacityRatio: number): LoadStatus {
    if (capacityRatio < 0.3) return 'underutilized';
    if (capacityRatio <= 0.9) return 'normal';
    if (capacityRatio <= 1.0) return 'overloaded';
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
   * Generate a simple hash for config to detect changes.
   */
  private hashConfig(config: LoadConfig | null): string {
    if (!config) return 'null';
    return JSON.stringify({
      capacity: config.capacity,
      topicComplexity: config.topicComplexity,
      baseLoad: config.baseLoad,
      sizes: config.sizes,
      roleWeights: config.roleWeights,
    });
  }

  /**
   * Main calculation method: Calculate load for all members.
   * This is a pure, deterministic function.
   */
  calculateLoad(
    members: TeamMember[],
    topics: Topic[],
    tags: Tag[],
    revisionId: number,
    config?: LoadConfig | null
  ): LoadCalculationResult {
    // Use provided config or get from service
    const loadConfig = config ?? this.loadConfigService.getConfig();
    const configHash = this.hashConfig(loadConfig);

    // Check cache
    if (
      this.cache.key &&
      this.cache.result &&
      this.cache.key.revisionId === revisionId &&
      this.cache.key.configHash === configHash
    ) {
      return this.cache.result;
    }

    // Get configuration values
    const alpha = loadConfig?.topicComplexity.alpha ?? COMPLEXITY_CONSTANTS.ALPHA;
    const beta = loadConfig?.topicComplexity.beta ?? COMPLEXITY_CONSTANTS.BETA;
    const contractHoursPerWeek = loadConfig?.capacity.contractHoursPerWeek ?? 41;
    const overheadFactor = loadConfig?.capacity.overheadFactor ?? 0.35;
    const effectiveFullTimeCapacity = contractHoursPerWeek * (1 - overheadFactor);

    // Calculate default base load from enabled components
    const defaultBaseLoad = loadConfig
      ? loadConfig.baseLoad.components
          .filter((c) => c.enabled)
          .reduce((sum, c) => sum + c.hoursPerWeek, 0)
      : 3.5;

    const tagsMap = new Map(tags.map((t) => [t.name, t]));
    const topicsMap = new Map(topics.map((t) => [t.id, t]));

    // Calculate loads for each member
    const memberLoads: MemberLoadResult[] = members.map((member) => {
      const roles = this.getMemberRoles(member, topics);
      const activityMultiplier = this.getActivityMultiplier(member);

      // Get member-specific config values from member data (not config file)
      const partTimeFactor = member.partTimeFactor ?? 1.0;
      const baseLoadHoursPerWeek = member.baseLoadOverride ?? defaultBaseLoad;
      const effectiveCapacityHoursPerWeek = effectiveFullTimeCapacity * partTimeFactor;

      const topicContributions: TopicContribution[] = roles.map((role) => {
        const topic = topicsMap.get(role.topicId)!;
        const roleWeight = this.getRoleWeight(role.role, loadConfig);
        const tagWeightSum = this.calculateTagWeightSum(topic, tagsMap);
        const dependencyCount = this.calculateDependencyCount(topic);
        const topicComplexity = this.calculateTopicComplexity(topic, tagsMap, alpha, beta);
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
      const topicsLoad = activityMultiplier * rawLoad;
      const totalLoad = baseLoadHoursPerWeek + topicsLoad;
      const capacityRatio = effectiveCapacityHoursPerWeek > 0 
        ? totalLoad / effectiveCapacityHoursPerWeek 
        : 0;

      // Determine size
      const size = loadConfig
        ? this.loadConfigService.classifySize(loadConfig, totalLoad, effectiveCapacityHoursPerWeek)
        : this.classifySizeDefault(totalLoad, effectiveCapacityHoursPerWeek);

      return {
        memberId: member.id,
        memberName: member.displayName,
        isActive: member.active,
        activityMultiplier,
        partTimeFactor,
        rawLoad,
        topicsLoad,
        baseLoadHoursPerWeek,
        totalLoad,
        normalizedLoad: 0, // Will be calculated after median
        effectiveCapacityHoursPerWeek,
        capacityRatio,
        size,
        topicContributions,
        loadStatus: this.classifyLoadStatus(capacityRatio),
      };
    });

    // Calculate median load
    const allLoads = memberLoads.map((ml) => ml.totalLoad);
    const medianLoad = this.calculateMedian(allLoads);

    // Calculate normalized loads
    for (const ml of memberLoads) {
      ml.normalizedLoad = medianLoad > 0 ? ml.totalLoad / medianLoad : 0;
    }

    // Validate data and collect warnings
    const warnings = this.validateData(topics, members, tags);

    const result: LoadCalculationResult = {
      memberLoads,
      medianLoad,
      effectiveFullTimeCapacity,
      warnings,
      calculatedAt: new Date().toISOString(),
      alpha,
      beta,
      defaultBaseLoadHoursPerWeek: defaultBaseLoad,
      contractHoursPerWeek,
      overheadFactor,
    };

    // Update cache
    this.cache = {
      key: { revisionId, configHash },
      result,
    };

    return result;
  }

  /**
   * Default size classification when no config is available.
   */
  private classifySizeDefault(
    totalLoad: number,
    effectiveCapacity: number
  ): SizeLabel {
    if (totalLoad > effectiveCapacity) return 'XXL';
    if (totalLoad >= 20) return 'XL';
    if (totalLoad >= 14) return 'L';
    if (totalLoad >= 8) return 'M';
    if (totalLoad >= 2) return 'S';
    return 'XS';
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
  getFormulaExplanation(config?: LoadConfig | null): string {
    const loadConfig = config ?? this.loadConfigService.getConfig();
    const alpha = loadConfig?.topicComplexity.alpha ?? COMPLEXITY_CONSTANTS.ALPHA;
    const beta = loadConfig?.topicComplexity.beta ?? COMPLEXITY_CONSTANTS.BETA;
    const contractHours = loadConfig?.capacity.contractHoursPerWeek ?? 41;
    const overhead = loadConfig?.capacity.overheadFactor ?? 0.35;
    const effectiveCapacity = contractHours * (1 - overhead);
    
    // Get role weights from config or use defaults
    const roleWeights = loadConfig?.roleWeights ?? {
      R1: ROLE_WEIGHTS.R1,
      R2: ROLE_WEIGHTS.R2,
      R3: ROLE_WEIGHTS.R3,
      C: ROLE_WEIGHTS.C,
      I: ROLE_WEIGHTS.I,
    };

    return `Load is calculated as the sum of base load plus topic-based load.

**Total Load Formula:**
L_total(m) = L_base(m) + L_topics(m)

**Topic Load:**
L_topics(m) = activity(m) × Σ [roleWeight(m,t) × topicComplexity(t)]

**Topic Complexity:**
c(t) = 1 + ${alpha}×TagWeight(t) + ${beta}×DependencyCount(t)

**Capacity Calculation:**
• Contract hours: ${contractHours} h/week
• Overhead factor: ${(overhead * 100).toFixed(0)}%
• H_eff_full = ${contractHours} × (1 - ${overhead}) = ${effectiveCapacity.toFixed(2)} h/week
• H_eff(m) = H_eff_full × partTimeFactor(m)

**Capacity Ratio:**
CapacityRatio(m) = L_total(m) / H_eff(m)

**Role Weights:**
R1=${roleWeights.R1}, R2=${roleWeights.R2}, R3=${roleWeights.R3}, C=${roleWeights.C}, I=${roleWeights.I}

**Activity Multipliers:**
active=${ACTIVITY_MULTIPLIER.active}, inactive=${ACTIVITY_MULTIPLIER.inactive}

**Size Classification:**
• XS: < 2h/week
• S: 2-8h/week
• M: 8-14h/week
• L: 14-20h/week
• XL: 20h+ but within capacity
• XXL: exceeds capacity`;
  }
}
