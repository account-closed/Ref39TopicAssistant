/**
 * Index Monitor Service
 * 
 * Periodically validates that the search index matches the current datastore
 * by comparing checksums. Triggers a rebuild when changes are detected.
 */

import { Injectable, OnDestroy, signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';
import { BackendService } from './backend.service';
import { SearchEngineService } from './search-engine.service';
import { computeDatastoreChecksum } from './checksum';
import { Datastore } from '../models';

export interface IndexMonitorOptions {
  /** Interval in milliseconds between checks (default: 5000ms) */
  intervalMs?: number;
}

/**
 * Index status information
 */
export interface IndexStatus {
  /** Whether the index is currently being built */
  isBuilding: boolean;
  /** Whether the index is ready for searching */
  isReady: boolean;
  /** Number of documents in the index */
  documentCount: number;
  /** Timestamp when the index was last built */
  lastBuiltAt: string | null;
  /** Current checksum of the indexed data */
  checksum: string | null;
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

  // Signals for index status
  private isBuildingSignal = signal(false);
  private isReadySignal = signal(false);
  private lastBuiltAtSignal = signal<string | null>(null);
  private checksumSignal = signal<string | null>(null);

  /** Signal indicating if the index is currently being built */
  public readonly isBuilding = computed(() => this.isBuildingSignal());
  
  /** Signal indicating if the index is ready for searching */
  public readonly isReady = computed(() => this.isReadySignal());
  
  /** Signal with the timestamp of when the index was last built */
  public readonly lastBuiltAt = computed(() => this.lastBuiltAtSignal());
  
  /** Signal with the current checksum */
  public readonly checksum = computed(() => this.checksumSignal());

  /** Computed signal with full index status */
  public readonly indexStatus = computed<IndexStatus>(() => ({
    isBuilding: this.isBuildingSignal(),
    isReady: this.isReadySignal(),
    documentCount: this.searchEngine.getIndexSize(),
    lastBuiltAt: this.lastBuiltAtSignal(),
    checksum: this.checksumSignal()
  }));

  constructor(
    private backend: BackendService,
    private searchEngine: SearchEngineService
  ) {
    // Initialize from localStorage if available
    const storedMeta = this.searchEngine.getIndexMeta();
    if (storedMeta) {
      this.checksumSignal.set(storedMeta.checksum);
      this.lastBuiltAtSignal.set(storedMeta.builtAt);
    }
  }

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
      this.isBuildingSignal.set(true);

      // Compute current checksum
      const currentChecksum = await computeDatastoreChecksum(this.currentDatastore);

      // Compare with stored checksum
      const storedMeta = this.searchEngine.getIndexMeta();
      const storedChecksum = storedMeta?.checksum;

      if (currentChecksum !== storedChecksum) {
        // Rebuild index
        await this.rebuildIndex(currentChecksum);
      } else {
        // Index is up to date, mark as ready
        this.isReadySignal.set(true);
      }

      this.lastChecksum = currentChecksum;
      this.checksumSignal.set(currentChecksum);
    } finally {
      this.isRebuilding = false;
      this.isBuildingSignal.set(false);
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
    this.isBuildingSignal.set(true);
    try {
      const checksum = await computeDatastoreChecksum(this.currentDatastore);
      await this.rebuildIndex(checksum);
    } finally {
      this.isRebuilding = false;
      this.isBuildingSignal.set(false);
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

    // Update signals
    const now = new Date().toISOString();
    this.lastBuiltAtSignal.set(now);
    this.checksumSignal.set(checksum);
    this.isReadySignal.set(true);

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
