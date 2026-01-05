/**
 * Index Monitor Service
 * 
 * Periodically validates that the search index matches the current datastore
 * by comparing checksums. Triggers a rebuild when changes are detected.
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { BackendService } from './backend.service';
import { SearchEngineService } from './search-engine.service';
import { computeDatastoreChecksum } from './checksum';
import { Datastore } from '../models';

export interface IndexMonitorOptions {
  /** Interval in milliseconds between checks (default: 5000ms) */
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 5000;

@Injectable({
  providedIn: 'root'
})
export class IndexMonitorService implements OnDestroy {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRebuilding = false;
  private subscription: Subscription | null = null;
  private currentDatastore: Datastore | null = null;
  private lastChecksum: string | null = null;

  constructor(
    private backend: BackendService,
    private searchEngine: SearchEngineService
  ) {}

  /**
   * Starts the index monitor with periodic checksum validation.
   * 
   * @param options - Configuration options
   * @returns A stop function to halt monitoring
   */
  start(options: IndexMonitorOptions = {}): () => void {
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;

    // Subscribe to datastore changes for immediate index build
    this.subscription = this.backend.datastore$.subscribe(datastore => {
      if (datastore) {
        this.currentDatastore = datastore;
        // Trigger immediate check when datastore is loaded/updated
        this.checkAndRebuildIfNeeded();
      }
    });

    // Start periodic checking
    this.intervalId = setInterval(() => {
      this.checkAndRebuildIfNeeded();
    }, intervalMs);

    // Return stop function
    return () => this.stop();
  }

  /**
   * Stops the index monitor.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  /**
   * Checks if the index needs to be rebuilt and rebuilds if necessary.
   * Uses a mutex to prevent overlapping rebuilds.
   */
  async checkAndRebuildIfNeeded(): Promise<void> {
    // Skip if already rebuilding (mutex)
    if (this.isRebuilding) {
      return;
    }

    // Skip if no datastore is loaded
    if (!this.currentDatastore) {
      return;
    }

    try {
      this.isRebuilding = true;

      // Compute current checksum
      const currentChecksum = await computeDatastoreChecksum(this.currentDatastore);

      // Compare with stored checksum
      const storedMeta = this.searchEngine.getIndexMeta();
      const storedChecksum = storedMeta?.checksum;

      if (currentChecksum !== storedChecksum) {
        // Rebuild index
        await this.rebuildIndex(currentChecksum);
      }

      this.lastChecksum = currentChecksum;
    } finally {
      this.isRebuilding = false;
    }
  }

  /**
   * Forces an immediate index rebuild.
   */
  async forceRebuild(): Promise<void> {
    if (!this.currentDatastore) {
      return;
    }

    // Wait if another rebuild is in progress
    while (this.isRebuilding) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.isRebuilding = true;
    try {
      const checksum = await computeDatastoreChecksum(this.currentDatastore);
      await this.rebuildIndex(checksum);
    } finally {
      this.isRebuilding = false;
    }
  }

  /**
   * Rebuilds the search index and updates metadata.
   */
  private async rebuildIndex(checksum: string): Promise<void> {
    if (!this.currentDatastore) {
      return;
    }

    // Use requestIdleCallback if available to avoid UI freezing
    // For now, we do a direct async rebuild since it's fast enough
    await this.searchEngine.buildIndex(this.currentDatastore);
    this.searchEngine.setIndexMeta(checksum);

    console.debug('[IndexMonitor] Index rebuilt. Checksum:', checksum.substring(0, 16) + '...');
  }

  /**
   * Returns whether monitoring is active.
   */
  isMonitoring(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Returns the last computed checksum.
   */
  getLastChecksum(): string | null {
    return this.lastChecksum;
  }

  ngOnDestroy(): void {
    this.stop();
  }
}

/**
 * Convenience function to start the index monitor.
 * Returns a stop function for cleanup.
 */
export function startSearchIndexMonitor(
  monitorService: IndexMonitorService,
  options: IndexMonitorOptions = {}
): () => void {
  return monitorService.start(options);
}
