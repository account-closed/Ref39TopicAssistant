import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { BackendService } from './backend.service';
import { Datastore, Topic, TeamMember, Tag, LockPurpose } from '../models';
import { FileConnectionService } from './file-connection.service';
import { DatastoreCommitService } from './datastore-commit.service';
import { RefreshService } from './refresh.service';
import { WriteQueueService, QueuedOperation } from './write-queue.service';

/**
 * File System Access API implementation of the backend.
 * Uses shared JSON files on SMB with lockfile-based concurrency control.
 * All write operations are queued and batched before committing to disk.
 */
@Injectable({
  providedIn: 'root'
})
export class FileSystemBackendService extends BackendService {
  public datastore$: Observable<Datastore | null>;
  
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();
  
  private refreshSubscription?: Subscription;

  private fileConnection = inject(FileConnectionService);
  private datastoreCommit = inject(DatastoreCommitService);
  private refreshService = inject(RefreshService);
  private writeQueue = inject(WriteQueueService);

  constructor() {
    super();
    
    // Convert signal to observable for combining with datastore state
    const queuedOps$ = toObservable(this.writeQueue.queuedOperations);
    
    // Combine the committed datastore with pending queue operations
    // to provide an optimistic view of the data
    this.datastore$ = combineLatest([
      this.datastoreCommit.datastoreState$,
      queuedOps$
    ]).pipe(
      map(([state, queuedOps]) => {
        if (!state.datastore) {
          return null;
        }
        // Apply pending operations to show optimistic updates in UI
        return this.applyPendingOperations(state.datastore, queuedOps);
      })
    );
    
    // Listen for refresh triggers - reload datastore and rebuild index
    this.refreshSubscription = this.refreshService.refreshTrigger$.subscribe(signal => {
      if (signal && this.isConnected()) {
        this.loadDatastore();
      }
    });

    // Listen for connection changes
    this.fileConnection.connection$.subscribe(connection => {
      this.connectionStatusSubject.next(connection.connected);
    });
  }

  /**
   * Apply pending queue operations to the datastore for optimistic UI updates.
   */
  private applyPendingOperations(datastore: Datastore, operations: QueuedOperation[]): Datastore {
    let result = { ...datastore };
    const timestamp = new Date().toISOString();

    for (const op of operations) {
      switch (op.type) {
        case 'add-topic': {
          const topic = op.payload as Topic;
          result = { ...result, topics: [...result.topics, topic] };
          break;
        }
        case 'update-topic': {
          const { topicId, updates } = op.payload as { topicId: string; updates: Partial<Topic> };
          result = {
            ...result,
            topics: result.topics.map(t => t.id === topicId ? { ...t, ...updates, updatedAt: timestamp } : t)
          };
          break;
        }
        case 'delete-topic': {
          const { topicId } = op.payload as { topicId: string };
          result = { ...result, topics: result.topics.filter(t => t.id !== topicId) };
          break;
        }
        case 'add-member': {
          const member = op.payload as TeamMember;
          result = { ...result, members: [...result.members, member] };
          break;
        }
        case 'update-member': {
          const { memberId, updates } = op.payload as { memberId: string; updates: Partial<TeamMember> };
          result = {
            ...result,
            members: result.members.map(m => m.id === memberId ? { ...m, ...updates, updatedAt: timestamp } : m)
          };
          break;
        }
        case 'delete-member': {
          const { memberId } = op.payload as { memberId: string };
          result = { ...result, members: result.members.filter(m => m.id !== memberId) };
          break;
        }
        case 'add-tag': {
          const tag = op.payload as Tag;
          result = { ...result, tags: [...(result.tags || []), tag] };
          break;
        }
        case 'update-tag': {
          const { tagId, updates } = op.payload as { tagId: string; updates: Partial<Tag> };
          if (result.tags) {
            result = {
              ...result,
              tags: result.tags.map(t => t.id === tagId ? { ...t, ...updates, modifiedAt: timestamp } : t)
            };
          }
          break;
        }
        case 'delete-tag': {
          const { tagId } = op.payload as { tagId: string };
          if (result.tags) {
            result = { ...result, tags: result.tags.filter(t => t.id !== tagId) };
          }
          break;
        }
        case 'update-multiple-topics': {
          const updates = op.payload as Array<{ topicId: string; changes: Partial<Topic> }>;
          const updateMap = new Map(updates.map(u => [u.topicId, u.changes]));
          result = {
            ...result,
            topics: result.topics.map(topic => {
              const changes = updateMap.get(topic.id);
              return changes ? { ...topic, ...changes, updatedAt: timestamp } : topic;
            })
          };
          break;
        }
      }
    }

    return result;
  }

  async connect(): Promise<void> {
    await this.fileConnection.connectToFolder();
    await this.loadDatastore();
  }

  isConnected(): boolean {
    return this.fileConnection.isConnected();
  }

  setCurrentUser(memberId: string, displayName: string): void {
    this.datastoreCommit.setCurrentUser(memberId, displayName);
  }

  async loadDatastore(): Promise<void> {
    const result = await this.datastoreCommit.loadDatastore();
    if (!result.success) {
      console.error('Failed to load datastore:', result.germanMessage);
      // Don't throw - the service keeps last valid state
    }
  }

  getDatastore(): Datastore | null {
    // Return the optimistic datastore that includes pending queue changes
    const baseDatastore = this.datastoreCommit.getDatastore();
    if (!baseDatastore) return null;
    
    const queuedOps = this.writeQueue.queuedOperations();
    return this.applyPendingOperations(baseDatastore, queuedOps);
  }

  // All write operations now queue instead of immediately committing
  // The UI sees optimistic updates via datastore$ observable
  // Actual file writes happen when saveNow() is called

  async addTopic(topic: Topic): Promise<boolean> {
    this.writeQueue.queueAddTopic(topic);
    return true; // Optimistically return success
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    this.writeQueue.queueUpdateTopic(topicId, updates);
    return true;
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    this.writeQueue.queueDeleteTopic(topicId);
    return true;
  }

  async addMember(member: TeamMember): Promise<boolean> {
    this.writeQueue.queueAddMember(member);
    return true;
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    this.writeQueue.queueUpdateMember(memberId, updates);
    return true;
  }

  async deleteMember(memberId: string): Promise<boolean> {
    this.writeQueue.queueDeleteMember(memberId);
    return true;
  }

  async addTag(tag: Tag): Promise<boolean> {
    this.writeQueue.queueAddTag(tag);
    return true;
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<boolean> {
    this.writeQueue.queueUpdateTag(tagId, updates);
    return true;
  }

  async deleteTag(tagId: string): Promise<boolean> {
    this.writeQueue.queueDeleteTag(tagId);
    return true;
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    this.writeQueue.queueUpdateMultipleTopics(updates);
    return true;
  }

  generateUUID(): string {
    return this.datastoreCommit.generateUUID();
  }
}
