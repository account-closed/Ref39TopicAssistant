/**
 * Load configuration model for `datadir/load_config.json`.
 * Defines base load, capacity, size thresholds, and member-specific overrides.
 */

/**
 * Base load component (e.g., daily standup, JF meeting).
 */
export interface BaseLoadComponent {
  name: string;
  hoursPerWeek: number;
  enabled: boolean;
}

/**
 * Member-specific base load override.
 */
export interface MemberBaseLoadOverride {
  hoursPerWeek: number;
}

/**
 * Size threshold definition.
 */
export interface SizeThreshold {
  name: 'XS' | 'S' | 'M' | 'L';
  min: number;
  max: number;
}

/**
 * Size classification label.
 */
export type SizeLabel = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

/**
 * Complete load configuration structure.
 */
export interface LoadConfig {
  schemaVersion: number;
  units: {
    loadPointEqualsHoursPerWeek: number;
  };
  capacity: {
    contractHoursPerWeek: number;
    overheadFactor: number;
  };
  topicComplexity: {
    alpha: number;
    beta: number;
  };
  baseLoad: {
    defaultHoursPerWeek: number;
    components: BaseLoadComponent[];
    memberOverrides: Record<string, MemberBaseLoadOverride>;
  };
  members: {
    partTimeFactors: Record<string, number>;
  };
  sizes: {
    thresholds: SizeThreshold[];
  };
}

/**
 * Default load configuration values.
 */
export const DEFAULT_LOAD_CONFIG: LoadConfig = {
  schemaVersion: 1,
  units: {
    loadPointEqualsHoursPerWeek: 1.0,
  },
  capacity: {
    contractHoursPerWeek: 41,
    overheadFactor: 0.35,
  },
  topicComplexity: {
    alpha: 1.0,
    beta: 0.25,
  },
  baseLoad: {
    defaultHoursPerWeek: 3.5,
    components: [
      { name: 'JF', hoursPerWeek: 2.0, enabled: true },
      { name: 'Daily 1', hoursPerWeek: 0.5, enabled: true },
      { name: 'Daily 2', hoursPerWeek: 0.5, enabled: true },
      { name: 'Daily 3', hoursPerWeek: 0.5, enabled: true },
    ],
    memberOverrides: {},
  },
  members: {
    partTimeFactors: {},
  },
  sizes: {
    thresholds: [
      { name: 'XS', min: 0.0, max: 2.0 },
      { name: 'S', min: 2.0, max: 8.0 },
      { name: 'M', min: 8.0, max: 14.0 },
      { name: 'L', min: 14.0, max: 20.0 },
    ],
  },
};

/**
 * Validation result for load config.
 */
export interface LoadConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
