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
    const result = await this.datastoreCommit.addTopic(topic);
    return result.success;
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    const result = await this.datastoreCommit.updateTopic(topicId, updates);
    return result.success;
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    const result = await this.datastoreCommit.deleteTopic(topicId);
    return result.success;
  }

  async addMember(member: TeamMember): Promise<boolean> {
    const result = await this.datastoreCommit.addMember(member);
    return result.success;
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    const result = await this.datastoreCommit.updateMember(memberId, updates);
    return result.success;
  }

  async deleteMember(memberId: string): Promise<boolean> {
    const result = await this.datastoreCommit.deleteMember(memberId);
    return result.success;
  }

  async addTag(tag: Tag): Promise<boolean> {
    const result = await this.datastoreCommit.addTag(tag);
    return result.success;
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<boolean> {
    const result = await this.datastoreCommit.updateTag(tagId, updates);
    return result.success;
  }

  async deleteTag(tagId: string): Promise<boolean> {
    const result = await this.datastoreCommit.deleteTag(tagId);
    return result.success;
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    const result = await this.datastoreCommit.updateMultipleTopics(updates);
    return result.success;
  }

  generateUUID(): string {
    return this.datastoreCommit.generateUUID();
  }
}
