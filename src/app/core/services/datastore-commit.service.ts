import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FileConnectionService, FileConnectionError } from './file-connection.service';
import { LockService, LockAcquireResult } from './lock.service';
import { RefreshService } from './refresh.service';
import { Datastore, Topic, TeamMember, LockPurpose } from '../models';

export interface CommitResult {
  success: boolean;
  germanMessage: string;
  datastore?: Datastore;
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
        // Initialize empty datastore
        const emptyDatastore = this.createEmptyDatastore();
        this.updateState(emptyDatastore, true, null);
        return {
          success: true,
          germanMessage: 'Leerer Datenspeicher erstellt.',
          datastore: emptyDatastore
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
   * Follows the specification: acquire lock, re-read, validate, apply, update metadata,
   * write, verify, write refresh, release lock.
   */
  async commitChanges(
    modifyFn: (datastore: Datastore) => Datastore,
    purpose: LockPurpose
  ): Promise<CommitResult> {
    // Step 1: Acquire lock
    const lockResult = await this.lockService.acquireLock(purpose);
    if (!lockResult.success) {
      return {
        success: false,
        germanMessage: lockResult.germanMessage
      };
    }

    try {
      // Step 2: Re-read datastore.json
      const content = await this.fileConnection.readDatastore();
      
      let datastore: Datastore;
      try {
        datastore = JSON.parse(content) as Datastore;
      } catch (parseError) {
        return {
          success: false,
          germanMessage: 'Ungültiges JSON-Format in datastore.json. Änderungen wurden nicht gespeichert.'
        };
      }

      // Step 3: Validate schema
      const validationErrors = this.validateDatastore(datastore);
      if (validationErrors.length > 0) {
        return {
          success: false,
          germanMessage: 'Ungültiges Datenschema: ' + validationErrors.map(e => e.germanMessage).join(', ')
        };
      }

      // Step 4: Apply the change (pure function)
      const modifiedDatastore = modifyFn(datastore);

      // Step 5: Update metadata
      modifiedDatastore.revisionId = datastore.revisionId + 1;
      modifiedDatastore.generatedAt = new Date().toISOString();

      // Step 6: Write datastore.json
      const newContent = JSON.stringify(modifiedDatastore, null, 2);
      await this.fileConnection.writeDatastore(newContent);

      // Step 7: Verification step (mandatory)
      const verifyContent = await this.fileConnection.readDatastore();
      let verifiedDatastore: Datastore;
      try {
        verifiedDatastore = JSON.parse(verifyContent) as Datastore;
      } catch (parseError) {
        return {
          success: false,
          germanMessage: 'Verifizierung fehlgeschlagen: Geschriebene Datei ist kein gültiges JSON.'
        };
      }

      if (verifiedDatastore.revisionId !== modifiedDatastore.revisionId) {
        return {
          success: false,
          germanMessage: `Verifizierung fehlgeschlagen: Revision stimmt nicht überein (erwartet: ${modifiedDatastore.revisionId}, gefunden: ${verifiedDatastore.revisionId}).`
        };
      }

      // Step 8: Write refresh.json signal
      await this.refreshService.writeRefreshSignal(
        modifiedDatastore.revisionId,
        this.currentMemberId,
        this.currentMemberName
      );

      // Update local state
      this.updateState(modifiedDatastore, true, null);

      return {
        success: true,
        germanMessage: 'Änderungen erfolgreich gespeichert.',
        datastore: modifiedDatastore
      };
    } catch (error) {
      const errorMsg = error instanceof FileConnectionError 
        ? error.germanMessage 
        : 'Fehler beim Speichern: ' + (error as Error).message;
      
      return {
        success: false,
        germanMessage: errorMsg
      };
    } finally {
      // Step 9: Release lock
      await this.lockService.releaseLock();
    }
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
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      revisionId: 0,
      members: [],
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
      if (typeof topic.raci.r1MemberId !== 'string' || !topic.raci.r1MemberId) {
        errors.push({ field: `${prefix}.raci.r1MemberId`, germanMessage: `${prefix}.raci.r1MemberId ist erforderlich` });
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
