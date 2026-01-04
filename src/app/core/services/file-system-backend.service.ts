import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BackendService } from './backend.service';
import { Datastore, Topic, TeamMember, LockPurpose } from '../models';
import { FileConnectionService } from './file-connection.service';
import { LockService } from './lock.service';
import { RefreshService } from './refresh.service';

/**
 * File System Access API implementation of the backend.
 * Uses shared JSON files on SMB with lockfile-based concurrency control.
 */
@Injectable({
  providedIn: 'root'
})
export class FileSystemBackendService extends BackendService {
  private datastoreSubject = new BehaviorSubject<Datastore | null>(null);
  public datastore$: Observable<Datastore | null> = this.datastoreSubject.asObservable();
  
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();
  
  private currentMemberId: string = '';
  private currentMemberName: string = '';

  constructor(
    private fileConnection: FileConnectionService,
    private lockService: LockService,
    private refreshService: RefreshService
  ) {
    super();
    
    // Listen for refresh triggers
    this.refreshService.refreshTrigger$.subscribe(signal => {
      if (signal) {
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
    this.currentMemberId = memberId;
    this.currentMemberName = displayName;
    this.lockService.setCurrentMember(memberId);
  }

  async loadDatastore(): Promise<void> {
    try {
      const content = await this.fileConnection.readDatastore();
      
      if (!content || content.trim() === '') {
        // Initialize empty datastore
        const emptyDatastore: Datastore = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          revisionId: 0,
          members: [],
          topics: []
        };
        this.datastoreSubject.next(emptyDatastore);
        await this.fileConnection.writeDatastore(JSON.stringify(emptyDatastore, null, 2));
        return;
      }

      const datastore = JSON.parse(content) as Datastore;
      
      // Validate schema
      if (!this.validateDatastore(datastore)) {
        throw new Error('Invalid datastore schema');
      }

      this.datastoreSubject.next(datastore);
    } catch (error) {
      console.error('Failed to load datastore:', error);
      throw error;
    }
  }

  getDatastore(): Datastore | null {
    return this.datastoreSubject.value;
  }

  async addTopic(topic: Topic): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        datastore.topics.push(topic);
        return datastore;
      },
      'topic-save'
    );
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        const index = datastore.topics.findIndex(t => t.id === topicId);
        if (index !== -1) {
          datastore.topics[index] = { 
            ...datastore.topics[index], 
            ...updates, 
            updatedAt: new Date().toISOString() 
          };
        }
        return datastore;
      },
      'topic-save'
    );
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        datastore.topics = datastore.topics.filter(t => t.id !== topicId);
        return datastore;
      },
      'topic-save'
    );
  }

  async addMember(member: TeamMember): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        datastore.members.push(member);
        return datastore;
      },
      'member-save'
    );
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        const index = datastore.members.findIndex(m => m.id === memberId);
        if (index !== -1) {
          datastore.members[index] = { 
            ...datastore.members[index], 
            ...updates, 
            updatedAt: new Date().toISOString() 
          };
        }
        return datastore;
      },
      'member-save'
    );
  }

  async deleteMember(memberId: string): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        datastore.members = datastore.members.filter(m => m.id !== memberId);
        return datastore;
      },
      'member-save'
    );
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    return this.commitChanges(
      (datastore) => {
        updates.forEach(({ topicId, changes }) => {
          const index = datastore.topics.findIndex(t => t.id === topicId);
          if (index !== -1) {
            datastore.topics[index] = {
              ...datastore.topics[index],
              ...changes,
              updatedAt: new Date().toISOString()
            };
          }
        });
        return datastore;
      },
      'assignment-save'
    );
  }

  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async commitChanges(
    modifyFn: (datastore: Datastore) => Datastore,
    purpose: LockPurpose
  ): Promise<boolean> {
    try {
      // Step 1: Acquire lock
      const lockAcquired = await this.lockService.acquireLock(purpose, {
        memberId: this.currentMemberId,
        displayName: this.currentMemberName
      });

      if (!lockAcquired) {
        return false; // Lock is held by someone else
      }

      try {
        // Step 2: Re-read datastore
        const content = await this.fileConnection.readDatastore();
        let datastore = JSON.parse(content) as Datastore;

        // Step 3: Validate
        if (!this.validateDatastore(datastore)) {
          throw new Error('Invalid datastore schema');
        }

        // Step 4: Apply changes
        datastore = modifyFn(datastore);

        // Step 5: Update metadata
        datastore.revisionId++;
        datastore.generatedAt = new Date().toISOString();

        // Step 6: Write datastore
        const newContent = JSON.stringify(datastore, null, 2);
        await this.fileConnection.writeDatastore(newContent);

        // Step 7: Verify
        const verifyContent = await this.fileConnection.readDatastore();
        const verifiedDatastore = JSON.parse(verifyContent) as Datastore;

        if (verifiedDatastore.revisionId !== datastore.revisionId) {
          throw new Error('Verification failed: revision mismatch');
        }

        // Step 8: Write refresh signal
        await this.refreshService.writeRefreshSignal(
          datastore.revisionId,
          this.currentMemberId,
          this.currentMemberName
        );

        // Update local state
        this.datastoreSubject.next(datastore);

        return true;
      } finally {
        // Step 9: Release lock
        await this.lockService.releaseLock();
      }
    } catch (error) {
      console.error('Failed to commit changes:', error);
      return false;
    }
  }

  private validateDatastore(datastore: any): boolean {
    return (
      datastore &&
      typeof datastore.schemaVersion === 'number' &&
      typeof datastore.generatedAt === 'string' &&
      typeof datastore.revisionId === 'number' &&
      Array.isArray(datastore.members) &&
      Array.isArray(datastore.topics)
    );
  }
}
