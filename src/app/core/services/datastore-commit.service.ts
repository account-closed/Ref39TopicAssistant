import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FileConnectionService, FileConnectionError } from './file-connection.service';
import { LockService, LockAcquireResult } from './lock.service';
import { RefreshService } from './refresh.service';
import { Datastore, Topic, TeamMember, Tag, LockPurpose } from '../models';
import { runPlausibilityChecks, PlausibilityResult } from './datastore-plausibility';

export interface CommitResult {
  success: boolean;
  germanMessage: string;
  datastore?: Datastore;
  plausibilityResult?: PlausibilityResult;
}

export interface ValidationError {
  field: string;
  germanMessage: string;
}

export interface DatastoreState {
  datastore: Datastore | null;
  isValid: boolean;
  errorMessage: string | null;
  lastValidDatastore: Datastore | null;
}

export interface WriteQueueStatus {
  queueLength: number;
  isProcessing: boolean;
  queuedOperations: Array<{
    purpose: LockPurpose;
    timestamp: Date;
  }>;
}

/**
 * Single entry point for all datastore modifications.
 * Implements the lock acquire, commit, verification, refresh write, and lock release algorithm.
 */
@Injectable({
  providedIn: 'root'
})
export class DatastoreCommitService {
  private datastoreStateSubject = new BehaviorSubject<DatastoreState>({
    datastore: null,
    isValid: true,
    errorMessage: null,
    lastValidDatastore: null
  });
  
  public datastoreState$: Observable<DatastoreState> = this.datastoreStateSubject.asObservable();

  private currentMemberId: string = '';
  private currentMemberName: string = '';
  
  // Write queue for handling multiple quick writes in the same session
  private writeQueue: Array<{
    modifyFn: (datastore: Datastore) => Datastore;
    purpose: LockPurpose;
    timestamp: Date;
    resolve: (result: CommitResult) => void;
    reject: (error: any) => void;
  }> = [];
  private isProcessingQueue: boolean = false;
  
  // Write queue status observable
  private writeQueueStatusSubject = new BehaviorSubject<WriteQueueStatus>({
    queueLength: 0,
    isProcessing: false,
    queuedOperations: []
  });
  public writeQueueStatus$: Observable<WriteQueueStatus> = this.writeQueueStatusSubject.asObservable();

  constructor(
    private fileConnection: FileConnectionService,
    private lockService: LockService,
    private refreshService: RefreshService
  ) {}

  /**
   * Set the current user identity for commits.
   */
  setCurrentUser(memberId: string, displayName: string): void {
    this.currentMemberId = memberId;
    this.currentMemberName = displayName;
    this.lockService.setCurrentMember(memberId, displayName);
  }

  /**
   * Load the datastore from file.
   * Never crash on malformed JSON; keep last valid dataset and show error.
   */
  async loadDatastore(): Promise<CommitResult> {
    try {
      const content = await this.fileConnection.readDatastore();
      const currentState = this.datastoreStateSubject.value;
      
      if (!content || content.trim() === '') {
        // Initialize datastore with default admin
        const initialDatastore = this.createEmptyDatastore();
        
        // Write the initial datastore to file
        try {
          const newContent = JSON.stringify(initialDatastore, null, 2);
          await this.fileConnection.writeDatastore(newContent);
          console.log('Created new datastore with default admin user');
        } catch (writeError) {
          console.warn('Could not write initial datastore to file:', writeError);
          // Continue anyway - the datastore will be in memory
        }
        
        this.updateState(initialDatastore, true, null);
        return {
          success: true,
          germanMessage: 'Neuer Datenspeicher mit Standard-Admin erstellt.',
          datastore: initialDatastore
        };
      }

      // Try to parse JSON
      let parsedData: any;
      try {
        parsedData = JSON.parse(content);
      } catch (parseError) {
        // Malformed JSON - keep last valid state
        const errorMsg = 'Ungültiges JSON-Format in datastore.json. Die letzten gültigen Daten werden angezeigt.';
        this.updateState(currentState.lastValidDatastore, false, errorMsg);
        return {
          success: false,
          germanMessage: errorMsg,
          datastore: currentState.lastValidDatastore || undefined
        };
      }

      // Validate schema
      const validationErrors = this.validateDatastore(parsedData);
      if (validationErrors.length > 0) {
        const errorMsg = 'Ungültiges Datenschema: ' + validationErrors.map(e => e.germanMessage).join(', ');
        this.updateState(currentState.lastValidDatastore, false, errorMsg);
        return {
          success: false,
          germanMessage: errorMsg,
          datastore: currentState.lastValidDatastore || undefined
        };
      }

      const datastore = parsedData as Datastore;
      this.updateState(datastore, true, null);
      
      // Initialize refresh service with current revision
      this.refreshService.initializeFromRevision(datastore.revisionId, datastore.generatedAt);
      
      return {
        success: true,
        germanMessage: 'Datenspeicher erfolgreich geladen.',
        datastore
      };
    } catch (error) {
      const errorMsg = error instanceof FileConnectionError 
        ? error.germanMessage 
        : 'Fehler beim Laden des Datenspeichers: ' + (error as Error).message;
      
      const currentState = this.datastoreStateSubject.value;
      this.updateState(currentState.lastValidDatastore, false, errorMsg);
      
      return {
        success: false,
        germanMessage: errorMsg,
        datastore: currentState.lastValidDatastore || undefined
      };
    }
  }

  /**
   * Commit changes to the datastore.
   * Follows the specification: acquire lock, re-read, validate, apply, run plausibility checks,
   * update metadata, write, verify, write refresh, release lock.
   * 
   * Uses a write queue to handle multiple quick writes in the same session without blocking.
   */
  async commitChanges(
    modifyFn: (datastore: Datastore) => Datastore,
    purpose: LockPurpose
  ): Promise<CommitResult> {
    // Add to queue and process
    return new Promise<CommitResult>((resolve, reject) => {
      this.writeQueue.push({ 
        modifyFn, 
        purpose, 
        timestamp: new Date(),
        resolve, 
        reject 
      });
      this.updateWriteQueueStatus();
      this.processWriteQueue();
    });
  }

  /**
   * Process the write queue sequentially.
   * Batches multiple writes together when possible and maintains lock across operations.
   */
  private async processWriteQueue(): Promise<void> {
    // If already processing, the current process will handle new items
    if (this.isProcessingQueue) {
      this.updateWriteQueueStatus();
      return;
    }

    this.isProcessingQueue = true;
    this.updateWriteQueueStatus();

    try {
      while (this.writeQueue.length > 0) {
        // Batch multiple writes together
        const batch = this.writeQueue.splice(0, this.writeQueue.length);
        this.updateWriteQueueStatus();
        
        // Step 1: Acquire lock (will reuse if we already have it)
        const lockResult = await this.lockService.acquireLock(batch[0].purpose);
        if (!lockResult.success) {
          console.error('Failed to acquire lock:', lockResult.germanMessage);
          const errorResult: CommitResult = {
            success: false,
            germanMessage: lockResult.germanMessage
          };
          // Reject all items in batch
          batch.forEach(item => item.resolve(errorResult));
          continue;
        }

        try {
          // Process all writes in the batch
          for (const item of batch) {
            try {
              const result = await this.performCommit(item.modifyFn, item.purpose);
              item.resolve(result);
            } catch (error) {
              const errorMsg = error instanceof FileConnectionError 
                ? error.germanMessage 
                : 'Fehler beim Speichern: ' + (error as Error).message;
              
              console.error('Error during commit:', error);
              
              item.resolve({
                success: false,
                germanMessage: errorMsg
              });
            }
          }
        } finally {
          // Step 10: Release lock only if queue is empty
          if (this.writeQueue.length === 0) {
            await this.lockService.releaseLock();
          }
          this.updateWriteQueueStatus();
        }
      }
    } finally {
      this.isProcessingQueue = false;
      this.updateWriteQueueStatus();
    }
  }
  
  /**
   * Update the write queue status observable.
   */
  private updateWriteQueueStatus(): void {
    this.writeQueueStatusSubject.next({
      queueLength: this.writeQueue.length,
      isProcessing: this.isProcessingQueue,
      queuedOperations: this.writeQueue.map(item => ({
        purpose: item.purpose,
        timestamp: item.timestamp
      }))
    });
  }

  /**
   * Perform the actual commit operation (internal method used by queue processor).
   */
  private async performCommit(
    modifyFn: (datastore: Datastore) => Datastore,
    purpose: LockPurpose
  ): Promise<CommitResult> {
    console.log(`[DatastoreCommit] Starting commit for purpose: ${purpose}`);
    
    // Step 2: Re-read datastore.json
    console.log('[DatastoreCommit] Step 2: Reading datastore.json');
    const content = await this.fileConnection.readDatastore();
    
    let datastore: Datastore;
    try {
      datastore = JSON.parse(content) as Datastore;
      console.log(`[DatastoreCommit] Parsed datastore, current revision: ${datastore.revisionId}`);
    } catch (parseError) {
      console.error('[DatastoreCommit] JSON parse error:', parseError);
      return {
        success: false,
        germanMessage: 'Ungültiges JSON-Format in datastore.json. Änderungen wurden nicht gespeichert.'
      };
    }

    // Step 3: Validate schema
    console.log('[DatastoreCommit] Step 3: Validating schema before modification');
    const validationErrors = this.validateDatastore(datastore);
    if (validationErrors.length > 0) {
      console.error('[DatastoreCommit] Validation errors before modification:', validationErrors);
      return {
        success: false,
        germanMessage: 'Ungültiges Datenschema: ' + validationErrors.map(e => e.germanMessage).join(', ')
      };
    }

    // Step 4: Apply the change (pure function)
    console.log('[DatastoreCommit] Step 4: Applying modification function');
    let modifiedDatastore = modifyFn(datastore);
    console.log(`[DatastoreCommit] After modification: ${modifiedDatastore.topics.length} topics, ${modifiedDatastore.members.length} members`);
    
    // Validate modified datastore before plausibility checks
    console.log('[DatastoreCommit] Validating modified datastore');
    const postModValidationErrors = this.validateDatastore(modifiedDatastore);
    if (postModValidationErrors.length > 0) {
      console.error('[DatastoreCommit] Validation errors after modification:', postModValidationErrors);
      // Log details about the specific topic/item with errors
      postModValidationErrors.forEach(err => {
        console.error(`  - ${err.field}: ${err.germanMessage}`);
      });
      return {
        success: false,
        germanMessage: 'Ungültiges Datenschema nach Änderung: ' + postModValidationErrors.map(e => e.germanMessage).join(', ')
      };
    }

    // Step 5: Run plausibility checks to ensure data consistency
    console.log('[DatastoreCommit] Step 5: Running plausibility checks');
    const { datastore: cleanedDatastore, result: plausibilityResult } =
      runPlausibilityChecks(modifiedDatastore);
    modifiedDatastore = cleanedDatastore;
    if (plausibilityResult.hasChanges) {
      console.warn('[DatastoreCommit] Plausibility checks made changes:', plausibilityResult.changeLog);
    }

    // Step 6: Update metadata
    console.log('[DatastoreCommit] Step 6: Updating metadata');
    modifiedDatastore.revisionId = datastore.revisionId + 1;
    modifiedDatastore.generatedAt = new Date().toISOString();
    console.log(`[DatastoreCommit] New revision: ${modifiedDatastore.revisionId}`);

    // Step 7: Write datastore.json (backup is created automatically)
    console.log('[DatastoreCommit] Step 7: Writing datastore.json');
    const newContent = JSON.stringify(modifiedDatastore, null, 2);
    await this.fileConnection.writeDatastore(newContent);
    console.log('[DatastoreCommit] Write complete');

    // Step 8: Verification step (mandatory)
    console.log('[DatastoreCommit] Step 8: Verifying write');
    const verifyContent = await this.fileConnection.readDatastore();
    let verifiedDatastore: Datastore;
    try {
      verifiedDatastore = JSON.parse(verifyContent) as Datastore;
    } catch (parseError) {
      console.error('[DatastoreCommit] Verification JSON parse error:', parseError);
      return {
        success: false,
        germanMessage: 'Verifizierung fehlgeschlagen: Geschriebene Datei ist kein gültiges JSON.'
      };
    }

    if (verifiedDatastore.revisionId !== modifiedDatastore.revisionId) {
      console.error(`[DatastoreCommit] Revision mismatch: expected ${modifiedDatastore.revisionId}, got ${verifiedDatastore.revisionId}`);
      return {
        success: false,
        germanMessage: `Verifizierung fehlgeschlagen: Revision stimmt nicht überein (erwartet: ${modifiedDatastore.revisionId}, gefunden: ${verifiedDatastore.revisionId}).`
      };
    }
    console.log('[DatastoreCommit] Verification successful');

    // Step 9: Write refresh.json signal
    console.log('[DatastoreCommit] Step 9: Writing refresh signal');
    await this.refreshService.writeRefreshSignal(
      modifiedDatastore.revisionId,
      this.currentMemberId,
      this.currentMemberName
    );

    // Update local state
    this.updateState(modifiedDatastore, true, null);

    console.log('[DatastoreCommit] Commit completed successfully');
    return {
      success: true,
      germanMessage: 'Änderungen erfolgreich gespeichert.',
      datastore: modifiedDatastore,
      plausibilityResult
    };
  }

  // Convenience methods for common operations

  async addTopic(topic: Topic): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        datastore.topics.push(topic);
        return datastore;
      },
      'topic-save'
    );
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<CommitResult> {
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

  async deleteTopic(topicId: string): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        datastore.topics = datastore.topics.filter(t => t.id !== topicId);
        return datastore;
      },
      'topic-save'
    );
  }

  async addMember(member: TeamMember): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        datastore.members.push(member);
        return datastore;
      },
      'member-save'
    );
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<CommitResult> {
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

  async deleteMember(memberId: string): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        datastore.members = datastore.members.filter(m => m.id !== memberId);
        return datastore;
      },
      'member-save'
    );
  }

  async addTag(tag: Tag): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        if (!datastore.tags) {
          datastore.tags = [];
        }
        datastore.tags.push(tag);
        return datastore;
      },
      'tag-save'
    );
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        if (!datastore.tags) {
          datastore.tags = [];
          return datastore;
        }
        const index = datastore.tags.findIndex(t => t.id === tagId);
        if (index !== -1) {
          const oldName = datastore.tags[index].name;
          datastore.tags[index] = { 
            ...datastore.tags[index], 
            ...updates, 
            modifiedAt: new Date().toISOString() 
          };
          const newName = datastore.tags[index].name;
          
          // Update tag references in topics if name changed
          if (oldName !== newName) {
            datastore.topics = datastore.topics.map(topic => {
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
        return datastore;
      },
      'tag-save'
    );
  }

  async deleteTag(tagId: string): Promise<CommitResult> {
    return this.commitChanges(
      (datastore) => {
        if (!datastore.tags) {
          return datastore;
        }
        const tagToDelete = datastore.tags.find(t => t.id === tagId);
        if (tagToDelete) {
          // Remove tag from all topics
          datastore.topics = datastore.topics.map(topic => {
            if (topic.tags && topic.tags.includes(tagToDelete.name)) {
              return {
                ...topic,
                tags: topic.tags.filter(t => t !== tagToDelete.name)
              };
            }
            return topic;
          });
          // Remove the tag itself
          datastore.tags = datastore.tags.filter(t => t.id !== tagId);
        }
        return datastore;
      },
      'tag-save'
    );
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<CommitResult> {
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

  /**
   * Get current datastore snapshot.
   */
  getDatastore(): Datastore | null {
    return this.datastoreStateSubject.value.datastore;
  }

  /**
   * Generate a UUID.
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Private helper methods

  private updateState(datastore: Datastore | null, isValid: boolean, errorMessage: string | null): void {
    const currentState = this.datastoreStateSubject.value;
    this.datastoreStateSubject.next({
      datastore,
      isValid,
      errorMessage,
      lastValidDatastore: isValid && datastore ? datastore : currentState.lastValidDatastore
    });
  }

  private createEmptyDatastore(): Datastore {
    const adminId = this.generateUUID();
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      revisionId: 0,

      members: [
        {
          id: adminId,
          displayName: 'Admin',
          email: '',
          active: true,
          tags: ['admin'],
          updatedAt: new Date().toISOString()
        }
      ],
      topics: []

    };
  }

  /**
   * Validate datastore schema with German error messages.
   */
  private validateDatastore(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', germanMessage: 'Datenspeicher muss ein Objekt sein' });
      return errors;
    }

    // Validate schemaVersion
    if (typeof data.schemaVersion !== 'number') {
      errors.push({ field: 'schemaVersion', germanMessage: 'schemaVersion muss eine Zahl sein' });
    }

    // Validate generatedAt
    if (typeof data.generatedAt !== 'string') {
      errors.push({ field: 'generatedAt', germanMessage: 'generatedAt muss ein Zeitstempel sein' });
    }

    // Validate revisionId
    if (typeof data.revisionId !== 'number') {
      errors.push({ field: 'revisionId', germanMessage: 'revisionId muss eine Zahl sein' });
    }

    // Validate members array
    if (!Array.isArray(data.members)) {
      errors.push({ field: 'members', germanMessage: 'members muss ein Array sein' });
    } else {
      data.members.forEach((member: any, index: number) => {
        const memberErrors = this.validateMember(member, index);
        errors.push(...memberErrors);
      });
    }

    // Validate topics array
    if (!Array.isArray(data.topics)) {
      errors.push({ field: 'topics', germanMessage: 'topics muss ein Array sein' });
    } else {
      data.topics.forEach((topic: any, index: number) => {
        const topicErrors = this.validateTopic(topic, index);
        errors.push(...topicErrors);
      });
    }

    return errors;
  }

  private validateMember(member: any, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `members[${index}]`;

    if (!member || typeof member !== 'object') {
      errors.push({ field: prefix, germanMessage: `${prefix} muss ein Objekt sein` });
      return errors;
    }

    if (typeof member.id !== 'string' || !member.id) {
      errors.push({ field: `${prefix}.id`, germanMessage: `${prefix}.id ist erforderlich` });
    }

    if (typeof member.displayName !== 'string' || !member.displayName) {
      errors.push({ field: `${prefix}.displayName`, germanMessage: `${prefix}.displayName ist erforderlich` });
    }

    if (typeof member.active !== 'boolean') {
      errors.push({ field: `${prefix}.active`, germanMessage: `${prefix}.active muss ein Boolean sein` });
    }

    return errors;
  }

  private validateTopic(topic: any, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `topics[${index}]`;

    if (!topic || typeof topic !== 'object') {
      errors.push({ field: prefix, germanMessage: `${prefix} muss ein Objekt sein` });
      return errors;
    }

    if (typeof topic.id !== 'string' || !topic.id) {
      errors.push({ field: `${prefix}.id`, germanMessage: `${prefix}.id ist erforderlich` });
    }

    if (typeof topic.header !== 'string' || !topic.header) {
      errors.push({ field: `${prefix}.header`, germanMessage: `${prefix}.header ist erforderlich` });
    }

    // Validate validity
    if (!topic.validity || typeof topic.validity !== 'object') {
      errors.push({ field: `${prefix}.validity`, germanMessage: `${prefix}.validity ist erforderlich` });
    } else {
      if (typeof topic.validity.alwaysValid !== 'boolean') {
        errors.push({ field: `${prefix}.validity.alwaysValid`, germanMessage: `${prefix}.validity.alwaysValid muss ein Boolean sein` });
      }
    }

    // Validate RACI
    if (!topic.raci || typeof topic.raci !== 'object') {
      errors.push({ field: `${prefix}.raci`, germanMessage: `${prefix}.raci ist erforderlich` });
    } else {
      // r1MemberId is optional - topics without R1 are orphan topics
      if (topic.raci.r1MemberId !== undefined && topic.raci.r1MemberId !== null && topic.raci.r1MemberId !== '') {
        if (typeof topic.raci.r1MemberId !== 'string') {
          errors.push({ field: `${prefix}.raci.r1MemberId`, germanMessage: `${prefix}.raci.r1MemberId muss ein String sein` });
        }
      }
      if (!Array.isArray(topic.raci.cMemberIds)) {
        errors.push({ field: `${prefix}.raci.cMemberIds`, germanMessage: `${prefix}.raci.cMemberIds muss ein Array sein` });
      }
      if (!Array.isArray(topic.raci.iMemberIds)) {
        errors.push({ field: `${prefix}.raci.iMemberIds`, germanMessage: `${prefix}.raci.iMemberIds muss ein Array sein` });
      }
    }

    return errors;
  }
}
