import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Datastore, Topic, TeamMember, Tag, LockPurpose } from '../models';

/**
 * Abstract backend interface.
 * Implementations can use File System Access API, REST API, or any other storage mechanism.
 */
@Injectable({
  providedIn: 'root'
})
export abstract class BackendService {
  /**
   * Observable of the current datastore state.
   */
  abstract datastore$: Observable<Datastore | null>;

  /**
   * Connect to the backend/storage.
   * For file-based: opens directory picker
   * For REST: could validate connection or do nothing
   */
  abstract connect(): Promise<void>;

  /**
   * Check if backend is connected and ready.
   */
  abstract isConnected(): boolean;

  /**
   * Get connection status as observable.
   */
  abstract connectionStatus$: Observable<boolean>;

  /**
   * Load/reload the datastore.
   */
  abstract loadDatastore(): Promise<void>;

  /**
   * Get current datastore snapshot.
   */
  abstract getDatastore(): Datastore | null;

  /**
   * Set the current user identity.
   */
  abstract setCurrentUser(memberId: string, displayName: string): void;

  // Topic operations
  abstract addTopic(topic: Topic): Promise<boolean>;
  abstract updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean>;
  abstract deleteTopic(topicId: string): Promise<boolean>;

  // Member operations
  abstract addMember(member: TeamMember): Promise<boolean>;
  abstract updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean>;
  abstract deleteMember(memberId: string): Promise<boolean>;

  // Tag operations
  abstract addTag(tag: Tag): Promise<boolean>;
  abstract updateTag(tagId: string, updates: Partial<Tag>): Promise<boolean>;
  abstract deleteTag(tagId: string): Promise<boolean>;

  // Batch operations for quick assignment
  abstract updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean>;

  // Utility
  abstract generateUUID(): string;
}
