import { Injectable } from '@angular/core';
import { IrregularTaskEstimation, VarianceClass, WaveClass } from '../models/topic.model';
import { VARIANCE_CLASS_WEIGHTS, WAVE_CLASS_MULTIPLIERS } from '../models/irregular-task.model';

export interface IrregularTaskResult {
  frequencyP80: number;          // N_P80
  effortP80: number;             // T_P80
  yearlyHoursP80: number;        // N_P80 * T_P80
  weeklyPlanningHours: number;   // weeklyPlanningHours_P80
  weeklyPeakHours: number;       // weeklyPeakHours_P80
}

export interface IrregularTaskValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable({
  providedIn: 'root',
})
export class IrregularTaskService {
  
  /**
   * Calculate P80 estimation for irregular task
   */
  calculateP80(estimation: IrregularTaskEstimation): IrregularTaskResult {
    const k = VARIANCE_CLASS_WEIGHTS[estimation.varianceClass];
    const w = WAVE_CLASS_MULTIPLIERS[estimation.waveClass];
    
    // P80 estimation: value = typical + k * (max - typical)
    const frequencyP80 = estimation.frequencyTypical + k * (estimation.frequencyMax - estimation.frequencyTypical);
    const effortP80 = estimation.effortTypical + k * (estimation.effortMax - estimation.effortTypical);
    
    // Weekly planning share
    const yearlyHoursP80 = frequencyP80 * effortP80;
    const weeklyPlanningHours = yearlyHoursP80 / 52;
    
    // Weekly peak load
    const weeklyPeakHours = w * weeklyPlanningHours;
    
    return {
      frequencyP80,
      effortP80,
      yearlyHoursP80,
      weeklyPlanningHours,
      weeklyPeakHours,
    };
  }
  
  /**
   * Validate irregular task estimation
   */
  validate(estimation: IrregularTaskEstimation): IrregularTaskValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Ordering constraints
    if (estimation.frequencyMin < 0) {
      errors.push('Mindesthäufigkeit darf nicht negativ sein');
    }
    if (estimation.frequencyMin > estimation.frequencyTypical) {
      errors.push('Mindesthäufigkeit muss ≤ typische Häufigkeit sein');
    }
    if (estimation.frequencyTypical > estimation.frequencyMax) {
      errors.push('Typische Häufigkeit muss ≤ maximale Häufigkeit sein');
    }
    
    if (estimation.effortMin < 0) {
      errors.push('Mindestaufwand darf nicht negativ sein');
    }
    if (estimation.effortMin > estimation.effortTypical) {
      errors.push('Mindestaufwand muss ≤ typischer Aufwand sein');
    }
    if (estimation.effortTypical > estimation.effortMax) {
      errors.push('Typischer Aufwand muss ≤ maximaler Aufwand sein');
    }
    
    // Soft warnings
    if (estimation.effortTypical > 0 && estimation.effortMax / estimation.effortTypical > 3) {
      warnings.push('Sehr hohe Unsicherheit beim Aufwand (Max/Typisch > 3)');
    }
    if (estimation.frequencyTypical === 0) {
      warnings.push('Typische Häufigkeit ist 0 - Aufgabe hat keinen Planungseinfluss');
    }
    
    const result = this.calculateP80(estimation);
    if (result.weeklyPeakHours > 41) {
      warnings.push(`Überlastungsrisiko: Wöchentliche Spitzenlast (${result.weeklyPeakHours.toFixed(1)}h) überschreitet Vollzeitkapazität`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Apply defaults when user provides only typical values
   */
  applyDefaults(typicalFrequency: number, typicalEffort: number): IrregularTaskEstimation {
    return {
      frequencyMin: typicalFrequency * 0.5,
      frequencyTypical: typicalFrequency,
      frequencyMax: typicalFrequency * 1.5,
      effortMin: typicalEffort * 0.7,
      effortTypical: typicalEffort,
      effortMax: typicalEffort * 1.7,
      varianceClass: 'L2',
      waveClass: 'W2',
    };
  }
}
