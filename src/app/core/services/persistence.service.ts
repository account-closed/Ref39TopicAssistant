import { Injectable, inject, DestroyRef, signal } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CacheService, CacheConflict } from './cache.service';
import { DatastoreCommitService } from './datastore-commit.service';
import { FileConnectionService } from './file-connection.service';
import { RefreshService } from './refresh.service';
import { Datastore } from '../models';
import { runPlausibilityChecks } from './datastore-plausibility';

/**
 * Result of a persistence operation.
 */
export interface PersistenceResult {
  success: boolean;
  germanMessage: string;
}

/**
 * Auto-save interval in milliseconds. Default: 60 seconds.
 */
const AUTO_SAVE_INTERVAL_MS = 60000;

/**
 * PersistenceService - Handles backend communication
 * 
 * Architecture:
 *   Cache  <-->  PersistenceService  <-->  Backend (File or REST)
 * 
 * Responsibilities:
 * - Save cache to backend (on demand or auto-save)
 * - Load data from backend into cache
 * - Detect and handle conflicts between cache and backend
 * - Coordinate with file connection and locking
 */
@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private cache = inject(CacheService);
  private commitService = inject(DatastoreCommitService);
  private fileConnection = inject(FileConnectionService);
  private refreshService = inject(RefreshService);
  private destroyRef = inject(DestroyRef);

  private refreshSubscription?: Subscription;

  // State signals
  readonly isSaving = signal(false);
  readonly isLoading = signal(false);
  readonly lastSaveTime = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);

  constructor() {
    this.setupAutoSave();
    this.setupRefreshListener();
  }

  /**
   * Setup auto-save timer.
   */
  private setupAutoSave(): void {
    interval(AUTO_SAVE_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.cache.hasUnsavedChanges() && !this.isSaving()) {
          void this.saveToBackend();
        }
      });
  }

  /**
   * Listen for refresh triggers from backend.
   */
  private setupRefreshListener(): void {
    this.refreshSubscription = this.refreshService.refreshTrigger$.subscribe(signal => {
      if (signal && this.fileConnection.isConnected()) {
        void this.checkForExternalChanges();
      }
    });
  }

  /**
   * Load datastore from backend and initialize cache.
   */
  async loadFromBackend(): Promise<PersistenceResult> {
    if (this.isLoading()) {
      return { success: false, germanMessage: 'Ladevorgang läuft bereits' };
    }

    this.isLoading.set(true);
    this.lastError.set(null);

    try {
      const result = await this.commitService.loadDatastore();
      
      if (result.success && result.datastore) {
        this.cache.initializeFromBackend(result.datastore);
        return { success: true, germanMessage: 'Daten erfolgreich geladen' };
      } else {
        this.lastError.set(result.germanMessage);
        return { success: false, germanMessage: result.germanMessage };
      }
    } catch (error) {
      const message = `Fehler beim Laden: ${(error as Error).message}`;
      this.lastError.set(message);
      return { success: false, germanMessage: message };
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Save cache to backend.
   */
  async saveToBackend(): Promise<PersistenceResult> {
    if (this.isSaving()) {
      return { success: false, germanMessage: 'Speichervorgang läuft bereits' };
    }

    const datastoreToSave = this.cache.getDatastoreForSave();
    if (!datastoreToSave) {
      return { success: true, germanMessage: 'Keine Änderungen zu speichern' };
    }

    this.isSaving.set(true);
    this.lastError.set(null);

    try {
      // Run plausibility checks before saving
      const { datastore: cleanedDatastore, result: plausibilityResult } = runPlausibilityChecks(datastoreToSave);
      
      if (plausibilityResult.hasChanges) {
        console.log('[PersistenceService] Plausibility checks made corrections:', plausibilityResult.changeLog);
      }

      // Commit to backend
      const result = await this.commitService.commitChanges(
        () => cleanedDatastore,
        'topic-save'  // Default purpose, could be refined based on changes
      );

      if (result.success) {
        // Update cache to reflect successful save
        const newRevisionId = result.datastore?.revisionId || cleanedDatastore.revisionId + 1;
        this.cache.markAsSynced(newRevisionId);
        this.lastSaveTime.set(new Date().toISOString());
        
        return { success: true, germanMessage: 'Änderungen erfolgreich gespeichert' };
      } else {
        this.lastError.set(result.germanMessage);
        return { success: false, germanMessage: result.germanMessage };
      }
    } catch (error) {
      const message = `Fehler beim Speichern: ${(error as Error).message}`;
      this.lastError.set(message);
      return { success: false, germanMessage: message };
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Check for external changes and handle conflicts.
   */
  async checkForExternalChanges(): Promise<void> {
    if (this.isLoading() || this.isSaving()) {
      return;
    }

    try {
      // Load current backend state
      const result = await this.commitService.loadDatastore();
      
      if (result.success && result.datastore) {
        const currentCache = this.cache.getCacheState();
        
        // Check if backend has newer revision
        if (result.datastore.revisionId > currentCache.revisionId) {
          this.cache.handleExternalChanges(result.datastore);
        }
      }
    } catch (error) {
      console.error('[PersistenceService] Error checking for external changes:', error);
    }
  }

  /**
   * Force reload from backend, discarding local changes.
   */
  async forceReload(): Promise<PersistenceResult> {
    this.cache.reset();
    return this.loadFromBackend();
  }

  /**
   * Set the current user identity for commits.
   */
  setCurrentUser(memberId: string, displayName: string): void {
    this.commitService.setCurrentUser(memberId, displayName);
  }

  /**
   * Check if connected to backend.
   */
  isConnected(): boolean {
    return this.fileConnection.isConnected();
  }

  /**
   * Connect to backend (opens directory picker for file-based).
   */
  async connect(): Promise<PersistenceResult> {
    try {
      await this.fileConnection.connectToFolder();
      return this.loadFromBackend();
    } catch (error) {
      const message = `Verbindungsfehler: ${(error as Error).message}`;
      this.lastError.set(message);
      return { success: false, germanMessage: message };
    }
  }

  /**
   * Generate a UUID for new entities.
   */
  generateUUID(): string {
    return this.cache.generateUUID();
  }
}
