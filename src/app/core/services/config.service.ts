import { Injectable, signal } from '@angular/core';
import { InstanceConfig } from '../models/instance-config.model';

/**
 * ConfigService - Manages instance configuration (API URL, API key, PSK)
 *
 * Configuration can be loaded from:
 * 1. Local storage (persisted)
 * 2. Config file (future)
 * 3. User input via UI
 */
@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private readonly STORAGE_KEY = 'raci-instance-config';

  // Current configuration
  private readonly configSignal = signal<InstanceConfig | null>(null);
  readonly config = this.configSignal.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load configuration from local storage.
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored) as InstanceConfig;
        this.configSignal.set(config);
      }
    } catch (error) {
      console.error('Failed to load config from storage:', error);
    }
  }

  /**
   * Save configuration to local storage.
   */
  private saveToStorage(config: InstanceConfig): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save config to storage:', error);
    }
  }

  /**
   * Set the current instance configuration.
   */
  setConfig(config: InstanceConfig): void {
    this.configSignal.set(config);
    this.saveToStorage(config);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): InstanceConfig | null {
    return this.configSignal();
  }

  /**
   * Check if configuration is set.
   */
  isConfigured(): boolean {
    const config = this.configSignal();
    return config !== null &&
           config.apiUrl !== '' &&
           config.apiKey !== '' &&
           config.psk !== '';
  }

  /**
   * Clear the current configuration.
   */
  clearConfig(): void {
    this.configSignal.set(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Validate configuration.
   */
  validateConfig(config: InstanceConfig): string[] {
    const errors: string[] = [];

    if (!config.instanceId || config.instanceId.trim() === '') {
      errors.push('Instance ID is required');
    }

    if (!config.apiUrl || config.apiUrl.trim() === '') {
      errors.push('API URL is required');
    } else {
      try {
        new URL(config.apiUrl);
      } catch {
        errors.push('API URL is not a valid URL');
      }
    }

    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API Key is required');
    }

    if (!config.psk || config.psk.trim() === '') {
      errors.push('PSK is required');
    } else if (config.psk.length < 16) {
      errors.push('PSK must be at least 16 characters long');
    }

    return errors;
  }
}
