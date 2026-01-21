/**
 * Load configuration model for `datadir/load_config.json`.
 * Defines base load, capacity, size thresholds.
 * Note: Per-member settings are stored on TeamMember in the datastore.
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
 * Size threshold definition.
 */
export interface SizeThreshold {
  name: 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL';
  min: number;
  max: number;
}

/**
 * Role weight configuration for RACI roles.
 */
export interface RoleWeights {
  R1: number;
  R2: number;
  R3: number;
  C: number;
  I: number;
}

/**
 * Size classification label.
 */
export type SizeLabel = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

/**
 * Complete load configuration structure.
 * Note: Per-member settings (partTimeFactor, baseLoadOverride) are stored
 * directly on the TeamMember in the datastore, not in this config file.
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
  };
  sizes: {
    thresholds: SizeThreshold[];
  };
  roleWeights: RoleWeights;
}

/**
 * Default load configuration values.
 * Per-member settings are stored on TeamMember in the datastore.
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
  },
  sizes: {
    thresholds: [
      { name: 'XXS', min: 0.0, max: 1.0 },
      { name: 'XS', min: 1.0, max: 2.0 },
      { name: 'S', min: 2.0, max: 8.0 },
      { name: 'M', min: 8.0, max: 14.0 },
      { name: 'L', min: 14.0, max: 20.0 },
      { name: 'XL', min: 20.0, max: Infinity },
    ],
  },
  roleWeights: {
    R1: 3.0,
    R2: 2.0,
    R3: 1.5,
    C: 1.0,
    I: 0.5,
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
