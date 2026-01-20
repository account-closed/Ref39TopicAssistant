import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  LoadConfig,
  DEFAULT_LOAD_CONFIG,
  LoadConfigValidation,
} from '../models/load-config.model';
import { FileConnectionService } from './file-connection.service';

const LOAD_CONFIG_FILENAME = 'load_config.json';

/**
 * Maximum allowed overhead factor (exclusive upper bound).
 * Values at or above this are rejected during validation.
 */
export const MAX_OVERHEAD_FACTOR = 0.8;

/**
 * Service for managing load configuration stored in `datadir/load_config.json`.
 * Creates the config file with defaults if it doesn't exist.
 */
@Injectable({
  providedIn: 'root',
})
export class LoadConfigService {
  private readonly fileConnection = inject(FileConnectionService);

  private configSubject = new BehaviorSubject<LoadConfig | null>(null);
  public config$: Observable<LoadConfig | null> = this.configSubject.asObservable();

  private configFileHandle: FileSystemFileHandle | null = null;
  private lastModified: number | null = null;

  /**
   * Load or create the load config file.
   * Should be called after connecting to a data directory.
   */
  async loadOrCreate(): Promise<LoadConfig> {
    const connection = this.fileConnection.getConnection();
    if (!connection.directoryHandle) {
      throw new Error('Not connected to a data directory');
    }

    try {
      // Try to get existing file or create new one
      this.configFileHandle = await connection.directoryHandle.getFileHandle(
        LOAD_CONFIG_FILENAME,
        { create: true }
      );

      const file = await this.configFileHandle.getFile();
      this.lastModified = file.lastModified;
      const content = await file.text();

      if (!content || content.trim() === '') {
        // File is empty, create with defaults
        const defaultConfig = this.createDefaultConfig();
        await this.saveConfig(defaultConfig);
        this.configSubject.next(defaultConfig);
        console.log('[LoadConfig] Created default config file');
        return defaultConfig;
      }

      // Parse existing config
      const config = JSON.parse(content) as LoadConfig;
      const validation = this.validateConfig(config);

      if (!validation.isValid) {
        console.error('[LoadConfig] Config validation errors:', validation.errors);
        throw new Error('Invalid load config: ' + validation.errors.join(', '));
      }

      if (validation.warnings.length > 0) {
        console.warn('[LoadConfig] Config warnings:', validation.warnings);
      }

      // Auto-fix: Recalculate defaultHoursPerWeek from enabled components
      const enabledSum = config.baseLoad.components
        .filter((c) => c.enabled)
        .reduce((sum, c) => sum + c.hoursPerWeek, 0);

      if (Math.abs(enabledSum - config.baseLoad.defaultHoursPerWeek) > 0.01) {
        console.warn(
          `[LoadConfig] defaultHoursPerWeek (${config.baseLoad.defaultHoursPerWeek}) differs from enabled components sum (${enabledSum}). Auto-fixing.`
        );
        config.baseLoad.defaultHoursPerWeek = enabledSum;
        await this.saveConfig(config);
      }

      this.configSubject.next(config);
      return config;
    } catch (error: any) {
      if (error.name === 'SyntaxError') {
        console.error('[LoadConfig] Invalid JSON in config file, recreating with defaults');
        const defaultConfig = this.createDefaultConfig();
        await this.saveConfig(defaultConfig);
        this.configSubject.next(defaultConfig);
        return defaultConfig;
      }
      throw error;
    }
  }

  /**
   * Get the current config synchronously.
   */
  getConfig(): LoadConfig | null {
    return this.configSubject.value;
  }

  /**
   * Save the config to file.
   */
  async saveConfig(config: LoadConfig): Promise<void> {
    if (!this.configFileHandle) {
      throw new Error('Config file handle not initialized');
    }

    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error('Invalid config: ' + validation.errors.join(', '));
    }

    const content = JSON.stringify(config, null, 2);
    const writable = await this.configFileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    // Update last modified
    const file = await this.configFileHandle.getFile();
    this.lastModified = file.lastModified;

    this.configSubject.next(config);
    console.log('[LoadConfig] Config saved');
  }

  /**
   * Check if config file has been modified externally.
   */
  async hasExternalChanges(): Promise<boolean> {
    if (!this.configFileHandle || this.lastModified === null) {
      return false;
    }

    try {
      const file = await this.configFileHandle.getFile();
      return file.lastModified !== this.lastModified;
    } catch {
      return false;
    }
  }

  /**
   * Reload config from file.
   */
  async reload(): Promise<LoadConfig> {
    return this.loadOrCreate();
  }

  /**
   * Create default config.
   */
  private createDefaultConfig(): LoadConfig {
    return JSON.parse(JSON.stringify(DEFAULT_LOAD_CONFIG));
  }

  /**
   * Validate config structure and values.
   */
  validateConfig(config: unknown): LoadConfigValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config || typeof config !== 'object') {
      return { isValid: false, errors: ['Config must be an object'], warnings: [] };
    }

    const c = config as Record<string, unknown>;

    // Schema version
    if (typeof c['schemaVersion'] !== 'number' || c['schemaVersion'] !== 1) {
      errors.push('Invalid or missing schemaVersion (must be 1)');
    }

    // Capacity
    const capacity = c['capacity'] as Record<string, unknown> | undefined;
    if (!capacity || typeof capacity !== 'object') {
      errors.push('Missing capacity section');
    } else {
      if (typeof capacity['contractHoursPerWeek'] !== 'number' || (capacity['contractHoursPerWeek'] as number) <= 0) {
        errors.push('contractHoursPerWeek must be a positive number');
      }
      const overheadFactor = capacity['overheadFactor'];
      if (
        typeof overheadFactor !== 'number' ||
        overheadFactor < 0 ||
        overheadFactor >= MAX_OVERHEAD_FACTOR
      ) {
        errors.push(`overheadFactor must be between 0 and ${MAX_OVERHEAD_FACTOR} (exclusive)`);
      }
    }

    // Topic complexity
    const topicComplexity = c['topicComplexity'] as Record<string, unknown> | undefined;
    if (!topicComplexity || typeof topicComplexity !== 'object') {
      errors.push('Missing topicComplexity section');
    } else {
      if (typeof topicComplexity['alpha'] !== 'number' || (topicComplexity['alpha'] as number) < 0) {
        errors.push('alpha must be a non-negative number');
      }
      if (typeof topicComplexity['beta'] !== 'number' || (topicComplexity['beta'] as number) < 0) {
        errors.push('beta must be a non-negative number');
      }
    }

    // Base load
    const baseLoad = c['baseLoad'] as Record<string, unknown> | undefined;
    if (!baseLoad || typeof baseLoad !== 'object') {
      errors.push('Missing baseLoad section');
    } else {
      if (typeof baseLoad['defaultHoursPerWeek'] !== 'number') {
        errors.push('defaultHoursPerWeek must be a number');
      } else if ((baseLoad['defaultHoursPerWeek'] as number) < 0) {
        warnings.push('defaultHoursPerWeek is negative');
      }

      if (!Array.isArray(baseLoad['components'])) {
        errors.push('baseLoad.components must be an array');
      }
    }

    // Sizes
    const sizes = c['sizes'] as Record<string, unknown> | undefined;
    if (!sizes || typeof sizes !== 'object') {
      errors.push('Missing sizes section');
    }

    // Role weights
    const roleWeights = c['roleWeights'] as Record<string, unknown> | undefined;
    if (!roleWeights || typeof roleWeights !== 'object') {
      errors.push('Missing roleWeights section');
    } else {
      const requiredRoles = ['R1', 'R2', 'R3', 'C', 'I'];
      for (const role of requiredRoles) {
        if (typeof roleWeights[role] !== 'number' || (roleWeights[role] as number) < 0) {
          errors.push(`roleWeights.${role} must be a non-negative number`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate effective full-time capacity (hours/week).
   */
  calculateEffectiveFullTimeCapacity(config: LoadConfig): number {
    return config.capacity.contractHoursPerWeek * (1 - config.capacity.overheadFactor);
  }

  /**
   * Get the default base load from enabled components.
   */
  getDefaultBaseLoad(config: LoadConfig): number {
    return config.baseLoad.components
      .filter((c) => c.enabled)
      .reduce((sum, c) => sum + c.hoursPerWeek, 0);
  }

  /**
   * Determine size label based on total load and member's effective capacity.
   */
  classifySize(
    config: LoadConfig,
    totalLoad: number,
    effectiveCapacity: number
  ): 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' {
    // XXL: load exceeds capacity
    if (totalLoad > effectiveCapacity) {
      return 'XXL';
    }

    // Check thresholds (XXS, XS, S, M, L, XL)
    for (const threshold of config.sizes.thresholds) {
      if (totalLoad >= threshold.min && totalLoad < threshold.max) {
        return threshold.name;
      }
    }

    // Default to XL if beyond all thresholds but within capacity
    return 'XL';
  }
}
