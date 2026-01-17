import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { BehaviorSubject, Observable, Subject, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Datastore, Topic, TeamMember, Tag } from '../models';

/**
 * Conflict resolution strategy when backend and cache differ.
 */
export type ConflictResolution = 'use-cache' | 'use-backend' | 'pending';

/**
 * Represents a detected conflict between cache and backend.
 */
export interface CacheConflict {
  id: string;
  description: string;
  cacheVersion: Datastore;
  backendVersion: Datastore;
  detectedAt: string;
}

/**
 * Cache state containing the current datastore and metadata.
 */
export interface CacheState {
  datastore: Datastore | null;
  isDirty: boolean;  // Has unsaved changes
  lastSyncTime: string | null;
  revisionId: number;
}

/**
 * Result of a cache mutation operation.
 */
export interface CacheMutationResult {
  success: boolean;
  message: string;
}

/**
 * CacheService - The Single Source of Truth
 * 
 * Architecture:
 *   UI + Index  <-->  Cache  <-->  Backend (File-based or REST)
 * 
 * Core Principles:
 * - The cache is the central authority for application state
 * - All reads must come exclusively from the cache
 * - All writes must go to the cache first
 * - The UI and index must always reflect the current cache state
 * - Backend persistence is asynchronous and secondary
 */
@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private destroyRef = inject(DestroyRef);

  // Internal state
  private readonly cacheStateSubject = new BehaviorSubject<CacheState>({
    datastore: null,
    isDirty: false,
    lastSyncTime: null,
    revisionId: 0
  });

  // Conflict handling
  private readonly conflictSubject = new BehaviorSubject<CacheConflict | null>(null);
  private readonly conflictResolutionSubject = new Subject<ConflictResolution>();

  // Signals for reactive state
  readonly isSaving = signal(false);
  readonly isSyncing = signal(false);
  readonly lastError = signal<string | null>(null);

  // Computed signals
  readonly isDirty = computed(() => this.cacheStateSubject.value.isDirty);
  readonly pendingChangesCount = signal(0);

  // Observables for subscription
  readonly cacheState$: Observable<CacheState> = this.cacheStateSubject.asObservable();
  readonly conflict$: Observable<CacheConflict | null> = this.conflictSubject.asObservable();

  /**
   * Observable of the current datastore from cache.
   * This is the ONLY source of truth for the UI.
   */
  get datastore$(): Observable<Datastore | null> {
    return new Observable(subscriber => {
      const subscription = this.cacheStateSubject.subscribe(state => {
        subscriber.next(state.datastore);
      });
      return () => subscription.unsubscribe();
    });
  }

  /**
   * Get current datastore synchronously.
   * For use cases where observable pattern isn't suitable.
   */
  getDatastore(): Datastore | null {
    return this.cacheStateSubject.value.datastore;
  }

  /**
   * Get the current cache state.
   */
  getCacheState(): CacheState {
    return this.cacheStateSubject.value;
  }

  /**
   * Check if cache has unsaved changes.
   */
  hasUnsavedChanges(): boolean {
    return this.cacheStateSubject.value.isDirty;
  }

  // ==================== CACHE INITIALIZATION ====================

  /**
   * Initialize cache with datastore from backend.
   * Called after backend connection is established.
   */
  initializeFromBackend(datastore: Datastore): void {
    this.cacheStateSubject.next({
      datastore: this.deepClone(datastore),
      isDirty: false,
      lastSyncTime: new Date().toISOString(),
      revisionId: datastore.revisionId
    });
    this.pendingChangesCount.set(0);
    this.lastError.set(null);
  }

  /**
   * Reset cache to empty state.
   */
  reset(): void {
    this.cacheStateSubject.next({
      datastore: null,
      isDirty: false,
      lastSyncTime: null,
      revisionId: 0
    });
    this.pendingChangesCount.set(0);
    this.conflictSubject.next(null);
  }

  // ==================== TOPIC OPERATIONS ====================

  addTopic(topic: Topic): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const updatedDatastore: Datastore = {
      ...state.datastore,
      topics: [...state.datastore.topics, topic],
      generatedAt: new Date().toISOString()
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Thema hinzugefügt' };
  }

  updateTopic(topicId: string, updates: Partial<Topic>): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const topicIndex = state.datastore.topics.findIndex(t => t.id === topicId);
    if (topicIndex === -1) {
      return { success: false, message: 'Thema nicht gefunden' };
    }

    const timestamp = new Date().toISOString();
    const updatedTopics = [...state.datastore.topics];
    updatedTopics[topicIndex] = {
      ...updatedTopics[topicIndex],
      ...updates,
      updatedAt: timestamp
    };

    const updatedDatastore: Datastore = {
      ...state.datastore,
      topics: updatedTopics,
      generatedAt: timestamp
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Thema aktualisiert' };
  }

  deleteTopic(topicId: string): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const updatedDatastore: Datastore = {
      ...state.datastore,
      topics: state.datastore.topics.filter(t => t.id !== topicId),
      generatedAt: new Date().toISOString()
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Thema gelöscht' };
  }

  updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const timestamp = new Date().toISOString();
    const updateMap = new Map(updates.map(u => [u.topicId, u.changes]));
    
    const updatedTopics = state.datastore.topics.map(topic => {
      const changes = updateMap.get(topic.id);
      if (changes) {
        return { ...topic, ...changes, updatedAt: timestamp };
      }
      return topic;
    });

    const updatedDatastore: Datastore = {
      ...state.datastore,
      topics: updatedTopics,
      generatedAt: timestamp
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: `${updates.length} Themen aktualisiert` };
  }

  // ==================== MEMBER OPERATIONS ====================

  addMember(member: TeamMember): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const updatedDatastore: Datastore = {
      ...state.datastore,
      members: [...state.datastore.members, member],
      generatedAt: new Date().toISOString()
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Mitglied hinzugefügt' };
  }

  updateMember(memberId: string, updates: Partial<TeamMember>): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const memberIndex = state.datastore.members.findIndex(m => m.id === memberId);
    if (memberIndex === -1) {
      return { success: false, message: 'Mitglied nicht gefunden' };
    }

    const timestamp = new Date().toISOString();
    const updatedMembers = [...state.datastore.members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      ...updates,
      updatedAt: timestamp
    };

    const updatedDatastore: Datastore = {
      ...state.datastore,
      members: updatedMembers,
      generatedAt: timestamp
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Mitglied aktualisiert' };
  }

  deleteMember(memberId: string): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const updatedDatastore: Datastore = {
      ...state.datastore,
      members: state.datastore.members.filter(m => m.id !== memberId),
      generatedAt: new Date().toISOString()
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Mitglied gelöscht' };
  }

  // ==================== TAG OPERATIONS ====================

  addTag(tag: Tag): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const updatedDatastore: Datastore = {
      ...state.datastore,
      tags: [...(state.datastore.tags || []), tag],
      generatedAt: new Date().toISOString()
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Tag hinzugefügt' };
  }

  updateTag(tagId: string, updates: Partial<Tag>): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore || !state.datastore.tags) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const tagIndex = state.datastore.tags.findIndex(t => t.id === tagId);
    if (tagIndex === -1) {
      return { success: false, message: 'Tag nicht gefunden' };
    }

    const timestamp = new Date().toISOString();
    const oldTag = state.datastore.tags[tagIndex];
    const updatedTags = [...state.datastore.tags];
    updatedTags[tagIndex] = {
      ...oldTag,
      ...updates,
      modifiedAt: timestamp
    };

    // If tag name changed, update references in topics
    let updatedTopics = state.datastore.topics;
    if (updates.name && updates.name !== oldTag.name) {
      updatedTopics = state.datastore.topics.map(topic => {
        if (topic.tags && topic.tags.includes(oldTag.name)) {
          return {
            ...topic,
            tags: topic.tags.map(t => t === oldTag.name ? updates.name! : t)
          };
        }
        return topic;
      });
    }

    const updatedDatastore: Datastore = {
      ...state.datastore,
      tags: updatedTags,
      topics: updatedTopics,
      generatedAt: timestamp
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Tag aktualisiert' };
  }

  deleteTag(tagId: string): CacheMutationResult {
    const state = this.cacheStateSubject.value;
    if (!state.datastore || !state.datastore.tags) {
      return { success: false, message: 'Cache nicht initialisiert' };
    }

    const tagToDelete = state.datastore.tags.find(t => t.id === tagId);
    if (!tagToDelete) {
      return { success: false, message: 'Tag nicht gefunden' };
    }

    // Remove tag references from topics
    const updatedTopics = state.datastore.topics.map(topic => {
      if (topic.tags && topic.tags.includes(tagToDelete.name)) {
        return {
          ...topic,
          tags: topic.tags.filter(t => t !== tagToDelete.name)
        };
      }
      return topic;
    });

    const updatedDatastore: Datastore = {
      ...state.datastore,
      tags: state.datastore.tags.filter(t => t.id !== tagId),
      topics: updatedTopics,
      generatedAt: new Date().toISOString()
    };

    this.updateCacheState(updatedDatastore);
    return { success: true, message: 'Tag gelöscht' };
  }

  // ==================== SYNC WITH BACKEND ====================

  /**
   * Mark cache as synced (no dirty changes).
   * Called after successful backend save.
   */
  markAsSynced(newRevisionId: number): void {
    const state = this.cacheStateSubject.value;
    if (state.datastore) {
      this.cacheStateSubject.next({
        ...state,
        datastore: {
          ...state.datastore,
          revisionId: newRevisionId
        },
        isDirty: false,
        lastSyncTime: new Date().toISOString(),
        revisionId: newRevisionId
      });
      this.pendingChangesCount.set(0);
    }
  }

  /**
   * Handle external changes from backend.
   * Attempts automatic merge or raises conflict.
   */
  handleExternalChanges(backendDatastore: Datastore): void {
    const state = this.cacheStateSubject.value;
    
    if (!state.datastore) {
      // No local state, just accept backend version
      this.initializeFromBackend(backendDatastore);
      return;
    }

    if (!state.isDirty) {
      // No local changes, accept backend version
      this.initializeFromBackend(backendDatastore);
      return;
    }

    // We have local dirty changes and backend changed too - conflict!
    const conflict: CacheConflict = {
      id: `conflict_${Date.now()}`,
      description: 'Lokale Änderungen und Backend-Änderungen erkannt',
      cacheVersion: this.deepClone(state.datastore),
      backendVersion: this.deepClone(backendDatastore),
      detectedAt: new Date().toISOString()
    };

    this.conflictSubject.next(conflict);
  }

  /**
   * Resolve a conflict by choosing which version to keep.
   */
  resolveConflict(resolution: ConflictResolution): void {
    const conflict = this.conflictSubject.value;
    if (!conflict) return;

    if (resolution === 'use-cache') {
      // Keep cache version, mark as dirty to force re-save
      const state = this.cacheStateSubject.value;
      this.cacheStateSubject.next({
        ...state,
        isDirty: true
      });
    } else if (resolution === 'use-backend') {
      // Accept backend version, discard local changes
      this.initializeFromBackend(conflict.backendVersion);
    }

    this.conflictSubject.next(null);
    this.conflictResolutionSubject.next(resolution);
  }

  /**
   * Get the datastore ready for saving.
   * Returns null if no changes to save.
   */
  getDatastoreForSave(): Datastore | null {
    const state = this.cacheStateSubject.value;
    if (!state.isDirty || !state.datastore) {
      return null;
    }
    return this.deepClone(state.datastore);
  }

  // ==================== PRIVATE HELPERS ====================

  private updateCacheState(datastore: Datastore): void {
    const state = this.cacheStateSubject.value;
    const changeCount = this.pendingChangesCount() + 1;
    
    this.cacheStateSubject.next({
      ...state,
      datastore,
      isDirty: true
    });
    
    this.pendingChangesCount.set(changeCount);
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Generate a UUID for new entities.
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
