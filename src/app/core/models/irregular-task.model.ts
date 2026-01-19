import { VarianceClass, WaveClass, IrregularTaskEstimation } from './topic.model';

/**
 * Variance class → P80 weight mapping
 */
export const VARIANCE_CLASS_WEIGHTS: Record<VarianceClass, number> = {
  L0: 0.40, // very stable
  L1: 0.50, // low
  L2: 0.60, // medium
  L3: 0.75, // high
  L4: 0.90, // extreme
};

/**
 * Wave class → peak multiplier mapping
 */
export const WAVE_CLASS_MULTIPLIERS: Record<WaveClass, number> = {
  W0: 1.0, // evenly spread
  W1: 1.5, // slightly clustered
  W2: 2.0, // clustered
  W3: 3.0, // strongly clustered
  W4: 4.0, // extreme bursts
};

// Variance class options for UI
export const VARIANCE_CLASS_OPTIONS = [
  { value: 'L0', label: 'L0 - Sehr stabil', description: 'Sehr stabile, vorhersagbare Aufgabe' },
  { value: 'L1', label: 'L1 - Niedrig', description: 'Geringe Unsicherheit' },
  { value: 'L2', label: 'L2 - Mittel', description: 'Mittlere Unsicherheit (Standard)' },
  { value: 'L3', label: 'L3 - Hoch', description: 'Hohe Unsicherheit' },
  { value: 'L4', label: 'L4 - Extrem', description: 'Extreme Unsicherheit' },
];

// Wave class options for UI
export const WAVE_CLASS_OPTIONS = [
  { value: 'W0', label: 'W0 - Gleichmäßig', description: 'Gleichmäßig über das Jahr verteilt' },
  { value: 'W1', label: 'W1 - Leicht geclustert', description: 'Leichte Häufung' },
  { value: 'W2', label: 'W2 - Geclustert', description: 'Deutliche Häufung (Standard)' },
  { value: 'W3', label: 'W3 - Stark geclustert', description: 'Starke Häufung' },
  { value: 'W4', label: 'W4 - Extreme Spitzen', description: 'Extreme Lastspitzen' },
];

// Default values for irregular task estimation
export const DEFAULT_IRREGULAR_ESTIMATION: IrregularTaskEstimation = {
  frequencyMin: 0,
  frequencyTypical: 0,
  frequencyMax: 0,
  effortMin: 0,
  effortTypical: 0,
  effortMax: 0,
  varianceClass: 'L2',
  waveClass: 'W2',
};
