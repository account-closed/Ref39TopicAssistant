import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { BackendService } from './backend.service';
import { Datastore, Topic, TeamMember, Tag, LockPurpose } from '../models';
import { FileConnectionService } from './file-connection.service';
import { DatastoreCommitService } from './datastore-commit.service';
import { RefreshService } from './refresh.service';

/**
 * File System Access API implementation of the backend.
 * Uses shared JSON files on SMB with lockfile-based concurrency control.
 */
@Injectable({
  providedIn: 'root'
})
export class FileSystemBackendService extends BackendService {
  public datastore$: Observable<Datastore | null>;
  
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();
  
  private refreshSubscription?: Subscription;

  constructor(
    private fileConnection: FileConnectionService,
    private datastoreCommit: DatastoreCommitService,
    private refreshService: RefreshService
  ) {
    super();
    
    // Map datastore state to datastore observable
    this.datastore$ = this.datastoreCommit.datastoreState$.pipe(
      map(state => state.datastore)
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
    return this.datastoreCommit.getDatastore();
  }

  async addTopic(topic: Topic): Promise<boolean> {
    console.log('[FileSystemBackend] addTopic called for topic:', topic.id, topic.header);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.addTopic(topic).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to add topic:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Topic added successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error adding topic:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    console.log('[FileSystemBackend] updateTopic called for topic:', topicId);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.updateTopic(topicId, updates).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to update topic:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Topic updated successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error updating topic:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    console.log('[FileSystemBackend] deleteTopic called for topic:', topicId);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.deleteTopic(topicId).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to delete topic:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Topic deleted successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error deleting topic:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async addMember(member: TeamMember): Promise<boolean> {
    console.log('[FileSystemBackend] addMember called for member:', member.id, member.displayName);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.addMember(member).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to add member:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Member added successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error adding member:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    console.log('[FileSystemBackend] updateMember called for member:', memberId);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.updateMember(memberId, updates).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to update member:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Member updated successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error updating member:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async deleteMember(memberId: string): Promise<boolean> {
    console.log('[FileSystemBackend] deleteMember called for member:', memberId);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.deleteMember(memberId).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to delete member:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Member deleted successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error deleting member:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async addTag(tag: Tag): Promise<boolean> {
    console.log('[FileSystemBackend] addTag called for tag:', tag.id, tag.name);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.addTag(tag).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to add tag:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Tag added successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error adding tag:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<boolean> {
    console.log('[FileSystemBackend] updateTag called for tag:', tagId);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.updateTag(tagId, updates).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to update tag:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Tag updated successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error updating tag:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async deleteTag(tagId: string): Promise<boolean> {
    console.log('[FileSystemBackend] deleteTag called for tag:', tagId);
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.deleteTag(tagId).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to delete tag:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Tag deleted successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error deleting tag:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    console.log('[FileSystemBackend] updateMultipleTopics called for', updates.length, 'topics');
    
    // Fire-and-forget: don't wait for completion
    this.datastoreCommit.updateMultipleTopics(updates).then(result => {
      if (!result.success) {
        console.error('[FileSystemBackend] Failed to update multiple topics:', result.germanMessage);
      } else {
        console.log('[FileSystemBackend] Multiple topics updated successfully');
      }
    }).catch(error => {
      console.error('[FileSystemBackend] Unexpected error updating multiple topics:', error);
    });
    
    // Return immediately - success is optimistic
    return true;
  }

  generateUUID(): string {
    return this.datastoreCommit.generateUUID();
  }
}
