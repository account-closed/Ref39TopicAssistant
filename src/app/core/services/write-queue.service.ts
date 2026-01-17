import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatastoreCommitService, CommitResult } from './datastore-commit.service';
import { runPlausibilityChecks } from './datastore-plausibility';
import { Datastore, Topic, TeamMember, Tag } from '../models';

/**
 * Types of operations that can be queued.
 */
export type QueuedOperationType = 
  | 'add-topic' | 'update-topic' | 'delete-topic'
  | 'add-member' | 'update-member' | 'delete-member'
  | 'add-tag' | 'update-tag' | 'delete-tag'
  | 'update-multiple-topics';

/**
 * Represents a single queued write operation.
 */
export interface QueuedOperation {
  id: string;  // Unique ID for this operation
  type: QueuedOperationType;
  timestamp: string;  // ISO timestamp when queued
  payload: unknown;  // Operation-specific data
  description: string;  // Human-readable description in German
}

/**
 * Result of saving the queue.
 */
export interface SaveQueueResult {
  success: boolean;
  germanMessage: string;
  savedOperationsCount: number;
  consolidatedOperationsCount: number;
}

/**
 * Payload types for each operation
 */
export interface AddTopicPayload {
  type: 'add-topic';
  payload: Topic;
}

export interface UpdateTopicPayload {
  type: 'update-topic';
  payload: { topicId: string; updates: Partial<Topic> };
}

export interface DeleteTopicPayload {
  type: 'delete-topic';
  payload: { topicId: string };
}

export interface AddMemberPayload {
  type: 'add-member';
  payload: TeamMember;
}

export interface UpdateMemberPayload {
  type: 'update-member';
  payload: { memberId: string; updates: Partial<TeamMember> };
}

export interface DeleteMemberPayload {
  type: 'delete-member';
  payload: { memberId: string };
}

export interface AddTagPayload {
  type: 'add-tag';
  payload: Tag;
}

export interface UpdateTagPayload {
  type: 'update-tag';
  payload: { tagId: string; updates: Partial<Tag> };
}

export interface DeleteTagPayload {
  type: 'delete-tag';
  payload: { tagId: string };
}

export interface UpdateMultipleTopicsPayload {
  type: 'update-multiple-topics';
  payload: Array<{ topicId: string; changes: Partial<Topic> }>;
}

/**
 * Service to queue write operations and batch them before committing.
 * Provides auto-save functionality and operation consolidation.
 */
@Injectable({
  providedIn: 'root'
})
export class WriteQueueService {
  private commitService = inject(DatastoreCommitService);
  private destroyRef = inject(DestroyRef);

  // Signals for reactive state
  readonly queuedOperations = signal<QueuedOperation[]>([]);
  readonly isSaving = signal(false);
  readonly lastSaveTime = signal<string | null>(null);
  readonly hasUnsavedChanges = computed(() => this.queuedOperations().length > 0);
  readonly pendingChangesCount = computed(() => this.queuedOperations().length);

  constructor() {
    this.startAutoSaveTimer();
  }

  /**
   * Start the auto-save timer that triggers every 60 seconds.
   */
  private startAutoSaveTimer(): void {
    interval(60000) // 60 seconds
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.hasUnsavedChanges() && !this.isSaving()) {
          void this.saveNow();
        }
      });
  }

  /**
   * Generate a unique ID for operations.
   */
  private generateOperationId(): string {
    return 'op_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Add an operation to the queue.
   */
  private enqueueOperation(operation: Omit<QueuedOperation, 'id' | 'timestamp'>): void {
    const newOperation: QueuedOperation = {
      ...operation,
      id: this.generateOperationId(),
      timestamp: new Date().toISOString()
    };

    this.queuedOperations.update(ops => [...ops, newOperation]);
  }

  // Queue operation methods

  queueAddTopic(topic: Topic): void {
    this.enqueueOperation({
      type: 'add-topic',
      payload: topic,
      description: `Thema hinzufügen: "${topic.header}"`
    });
  }

  queueUpdateTopic(topicId: string, updates: Partial<Topic>): void {
    this.enqueueOperation({
      type: 'update-topic',
      payload: { topicId, updates },
      description: `Thema aktualisieren: ${topicId}`
    });
  }

  queueDeleteTopic(topicId: string): void {
    this.enqueueOperation({
      type: 'delete-topic',
      payload: { topicId },
      description: `Thema löschen: ${topicId}`
    });
  }

  queueAddMember(member: TeamMember): void {
    this.enqueueOperation({
      type: 'add-member',
      payload: member,
      description: `Mitglied hinzufügen: "${member.displayName}"`
    });
  }

  queueUpdateMember(memberId: string, updates: Partial<TeamMember>): void {
    this.enqueueOperation({
      type: 'update-member',
      payload: { memberId, updates },
      description: `Mitglied aktualisieren: ${memberId}`
    });
  }

  queueDeleteMember(memberId: string): void {
    this.enqueueOperation({
      type: 'delete-member',
      payload: { memberId },
      description: `Mitglied löschen: ${memberId}`
    });
  }

  queueAddTag(tag: Tag): void {
    this.enqueueOperation({
      type: 'add-tag',
      payload: tag,
      description: `Tag hinzufügen: "${tag.name}"`
    });
  }

  queueUpdateTag(tagId: string, updates: Partial<Tag>): void {
    this.enqueueOperation({
      type: 'update-tag',
      payload: { tagId, updates },
      description: `Tag aktualisieren: ${tagId}`
    });
  }

  queueDeleteTag(tagId: string): void {
    this.enqueueOperation({
      type: 'delete-tag',
      payload: { tagId },
      description: `Tag löschen: ${tagId}`
    });
  }

  queueUpdateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): void {
    this.enqueueOperation({
      type: 'update-multiple-topics',
      payload: updates,
      description: `Mehrere Themen aktualisieren: ${updates.length} Themen`
    });
  }

  /**
   * Get entity key from operation for consolidation purposes.
   */
  private getEntityKey(op: QueuedOperation): string | null {
    switch (op.type) {
      case 'add-topic': {
        const payload = op.payload as Topic;
        return `topic:${payload.id}`;
      }
      case 'update-topic':
      case 'delete-topic': {
        const payload = op.payload as { topicId: string };
        return `topic:${payload.topicId}`;
      }
      case 'add-member': {
        const payload = op.payload as TeamMember;
        return `member:${payload.id}`;
      }
      case 'update-member':
      case 'delete-member': {
        const payload = op.payload as { memberId: string };
        return `member:${payload.memberId}`;
      }
      case 'add-tag': {
        const payload = op.payload as Tag;
        return `tag:${payload.id}`;
      }
      case 'update-tag':
      case 'delete-tag': {
        const payload = op.payload as { tagId: string };
        return `tag:${payload.tagId}`;
      }
      case 'update-multiple-topics':
        return null; // Don't consolidate with other operations
    }
  }

  /**
   * Consolidate operations to minimize writes.
   * - Multiple updates to the same entity are merged (keep only latest)
   * - If entity is added then deleted, remove both operations
   * - If entity is updated then deleted, only keep delete
   * - If entity is deleted then added with same id, treat as update
   */
  private consolidateOperations(operations: QueuedOperation[]): QueuedOperation[] {
    const consolidated: QueuedOperation[] = [];
    const entityOps = new Map<string, QueuedOperation[]>();

    // Group operations by entity type and ID
    for (const op of operations) {
      const entityKey = this.getEntityKey(op);

      if (entityKey === null) {
        // Keep as-is, don't consolidate with other operations
        consolidated.push(op);
        continue;
      }

      if (!entityOps.has(entityKey)) {
        entityOps.set(entityKey, []);
      }
      entityOps.get(entityKey)!.push(op);
    }

    // Process each entity's operations
    for (const [entityKey, ops] of entityOps) {
      if (ops.length === 1) {
        consolidated.push(ops[0]);
        continue;
      }

      // Apply consolidation rules
      const firstOp = ops[0];
      const lastOp = ops[ops.length - 1];

      // Rule: add + delete = no operation
      if (firstOp.type.startsWith('add-') && lastOp.type.startsWith('delete-')) {
        continue; // Skip both operations
      }

      // Rule: update + delete = delete only
      if (firstOp.type.startsWith('update-') && lastOp.type.startsWith('delete-')) {
        consolidated.push(lastOp);
        continue;
      }

      // Rule: delete + add = update (merge the data)
      // Note: When an entity is deleted then re-added with the same ID,
      // we treat this as an update operation with the new entity data.
      if (firstOp.type.startsWith('delete-') && lastOp.type.startsWith('add-')) {
        const [entityType, entityId] = entityKey.split(':');
        const idField = `${entityType}Id`;
        
        // Create update operation from add payload
        const updateOp: QueuedOperation = {
          id: lastOp.id,
          type: `update-${entityType}` as QueuedOperationType,
          timestamp: lastOp.timestamp,
          payload: {
            [idField]: entityId,
            updates: lastOp.payload
          },
          description: `${entityType} aktualisieren: ${entityId}`
        };
        consolidated.push(updateOp);
        continue;
      }

      // Rule: multiple updates = merge into single update
      if (ops.every(op => op.type.startsWith('update-'))) {
        const [entityType, entityId] = entityKey.split(':');
        const idField = `${entityType}Id`;
        const mergedUpdates: Record<string, unknown> = {};
        
        for (const op of ops) {
          const payload = op.payload as { [key: string]: unknown };
          const updates = payload['updates'] as Record<string, unknown>;
          Object.assign(mergedUpdates, updates);
        }

        const mergedOp: QueuedOperation = {
          id: lastOp.id,
          type: lastOp.type,
          timestamp: lastOp.timestamp,
          payload: {
            [idField]: entityId,
            updates: mergedUpdates
          },
          description: `${entityType} aktualisieren (konsolidiert)`
        };
        consolidated.push(mergedOp);
        continue;
      }

      // Rule: add + updates = single add with merged data
      if (firstOp.type.startsWith('add-') && ops.slice(1).every(op => op.type.startsWith('update-'))) {
        const addPayload = { ...(firstOp.payload as Record<string, unknown>) };
        
        for (const op of ops.slice(1)) {
          const payload = op.payload as { [key: string]: unknown };
          const updates = payload['updates'] as Record<string, unknown>;
          Object.assign(addPayload, updates);
        }

        const mergedOp: QueuedOperation = {
          id: lastOp.id,
          type: firstOp.type,
          timestamp: lastOp.timestamp,
          payload: addPayload,
          description: `${firstOp.description} (konsolidiert)`
        };
        consolidated.push(mergedOp);
        continue;
      }

      // Default: keep last operation
      consolidated.push(lastOp);
    }

    return consolidated;
  }

  /**
   * Apply a single operation to the datastore.
   */
  private applyOperation(datastore: Datastore, operation: QueuedOperation): Datastore {
    const updatedDatastore = { ...datastore };
    const timestamp = new Date().toISOString(); // Single timestamp for consistency

    switch (operation.type) {
      case 'add-topic': {
        const topic = operation.payload as Topic;
        updatedDatastore.topics = [...updatedDatastore.topics, topic];
        break;
      }

      case 'update-topic': {
        const { topicId, updates } = operation.payload as { topicId: string; updates: Partial<Topic> };
        updatedDatastore.topics = updatedDatastore.topics.map(t =>
          t.id === topicId 
            ? { ...t, ...updates, updatedAt: timestamp }
            : t
        );
        break;
      }

      case 'delete-topic': {
        const { topicId } = operation.payload as { topicId: string };
        updatedDatastore.topics = updatedDatastore.topics.filter(t => t.id !== topicId);
        break;
      }

      case 'add-member': {
        const member = operation.payload as TeamMember;
        updatedDatastore.members = [...updatedDatastore.members, member];
        break;
      }

      case 'update-member': {
        const { memberId, updates } = operation.payload as { memberId: string; updates: Partial<TeamMember> };
        updatedDatastore.members = updatedDatastore.members.map(m =>
          m.id === memberId 
            ? { ...m, ...updates, updatedAt: timestamp }
            : m
        );
        break;
      }

      case 'delete-member': {
        const { memberId } = operation.payload as { memberId: string };
        updatedDatastore.members = updatedDatastore.members.filter(m => m.id !== memberId);
        break;
      }

      case 'add-tag': {
        const tag = operation.payload as Tag;
        if (!updatedDatastore.tags) {
          updatedDatastore.tags = [];
        }
        updatedDatastore.tags = [...updatedDatastore.tags, tag];
        break;
      }

      case 'update-tag': {
        const { tagId, updates } = operation.payload as { tagId: string; updates: Partial<Tag> };
        if (updatedDatastore.tags) {
          const index = updatedDatastore.tags.findIndex(t => t.id === tagId);
          if (index !== -1) {
            const oldName = updatedDatastore.tags[index].name;
            // Note: Tags use 'modifiedAt' per the Tag model (not 'updatedAt')
            const updatedTag = { 
              ...updatedDatastore.tags[index], 
              ...updates, 
              modifiedAt: timestamp 
            };
            updatedDatastore.tags = [
              ...updatedDatastore.tags.slice(0, index),
              updatedTag,
              ...updatedDatastore.tags.slice(index + 1)
            ];

            const newName = updatedTag.name;
            // Update tag references in topics if name changed
            if (oldName !== newName) {
              updatedDatastore.topics = updatedDatastore.topics.map(topic => {
                if (topic.tags && topic.tags.includes(oldName)) {
                  return {
                    ...topic,
                    tags: topic.tags.map(t => t === oldName ? newName : t)
                  };
                }
                return topic;
              });
            }
          }
        }
        break;
      }

      case 'delete-tag': {
        const { tagId } = operation.payload as { tagId: string };
        if (updatedDatastore.tags) {
          const tagToDelete = updatedDatastore.tags.find(t => t.id === tagId);
          if (tagToDelete) {
            // Remove tag from all topics
            updatedDatastore.topics = updatedDatastore.topics.map(topic => {
              if (topic.tags && topic.tags.includes(tagToDelete.name)) {
                return {
                  ...topic,
                  tags: topic.tags.filter(t => t !== tagToDelete.name)
                };
              }
              return topic;
            });
            // Remove the tag itself
            updatedDatastore.tags = updatedDatastore.tags.filter(t => t.id !== tagId);
          }
        }
        break;
      }

      case 'update-multiple-topics': {
        const updates = operation.payload as Array<{ topicId: string; changes: Partial<Topic> }>;
        const updateMap = new Map(updates.map(u => [u.topicId, u.changes]));
        updatedDatastore.topics = updatedDatastore.topics.map(topic => {
          const changes = updateMap.get(topic.id);
          if (changes) {
            return {
              ...topic,
              ...changes,
              updatedAt: timestamp
            };
          }
          return topic;
        });
        break;
      }
    }

    return updatedDatastore;
  }

  /**
   * Determine the appropriate lock purpose for the consolidated operations.
   */
  private determineLockPurpose(operations: QueuedOperation[]): 'topic-save' | 'member-save' | 'tag-save' | 'assignment-save' {
    const hasTopics = operations.some(op => op.type.includes('topic'));
    const hasMembers = operations.some(op => op.type.includes('member'));
    const hasTags = operations.some(op => op.type.includes('tag'));
    const hasMultipleTopics = operations.some(op => op.type === 'update-multiple-topics');

    if (hasMultipleTopics) {
      return 'assignment-save';
    }

    // Priority: tags > members > topics (most specific to least specific)
    if (hasTags) {
      return 'tag-save';
    }
    if (hasMembers) {
      return 'member-save';
    }
    if (hasTopics) {
      return 'topic-save';
    }

    // Default fallback
    return 'topic-save';
  }

  /**
   * Save all pending operations now.
   */
  async saveNow(): Promise<SaveQueueResult> {
    if (this.isSaving()) {
      return {
        success: false,
        germanMessage: 'Speichervorgang läuft bereits.',
        savedOperationsCount: 0,
        consolidatedOperationsCount: 0
      };
    }

    const operations = this.queuedOperations();
    if (operations.length === 0) {
      return {
        success: true,
        germanMessage: 'Keine ausstehenden Änderungen zum Speichern.',
        savedOperationsCount: 0,
        consolidatedOperationsCount: 0
      };
    }

    this.isSaving.set(true);

    try {
      // Consolidate operations
      const consolidatedOps = this.consolidateOperations(operations);
      
      // Log consolidation for debugging (only if consolidation occurred)
      if (consolidatedOps.length < operations.length) {
        console.log(`[WriteQueueService] Consolidated ${operations.length} operations into ${consolidatedOps.length}`);
      }

      // Determine lock purpose
      const lockPurpose = this.determineLockPurpose(consolidatedOps);

      // Apply all operations via commitChanges
      const result = await this.commitService.commitChanges(
        (datastore: Datastore) => {
          let modifiedDatastore = datastore;

          // Apply each consolidated operation
          for (const operation of consolidatedOps) {
            modifiedDatastore = this.applyOperation(modifiedDatastore, operation);
          }

          // Run plausibility checks
          const { datastore: cleanedDatastore } = runPlausibilityChecks(modifiedDatastore);
          return cleanedDatastore;
        },
        lockPurpose
      );

      if (result.success) {
        // Clear the queue on success
        this.queuedOperations.set([]);
        this.lastSaveTime.set(new Date().toISOString());

        return {
          success: true,
          germanMessage: `Erfolgreich gespeichert: ${consolidatedOps.length} Operationen (aus ${operations.length} konsolidiert).`,
          savedOperationsCount: operations.length,
          consolidatedOperationsCount: consolidatedOps.length
        };
      } else {
        return {
          success: false,
          germanMessage: result.germanMessage,
          savedOperationsCount: 0,
          consolidatedOperationsCount: consolidatedOps.length
        };
      }
    } catch (error) {
      console.error('[WriteQueueService] Error saving queue:', error);
      return {
        success: false,
        germanMessage: 'Fehler beim Speichern: ' + (error as Error).message,
        savedOperationsCount: 0,
        consolidatedOperationsCount: 0
      };
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Clear all pending operations without saving.
   */
  clearQueue(): void {
    this.queuedOperations.set([]);
  }
}
