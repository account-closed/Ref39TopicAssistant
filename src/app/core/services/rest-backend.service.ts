import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BackendService } from './backend.service';
import { Datastore, Topic, TeamMember, LockPurpose } from '../models';

/**
 * REST API implementation of the backend (placeholder).
 * This shows how easy it is to switch from File System to REST API.
 * 
 * To use this implementation:
 * 1. Update app.config.ts to provide RestBackendService instead of FileSystemBackendService
 * 2. Configure the API base URL
 * 3. No component changes needed!
 */
@Injectable({
  providedIn: 'root'
})
export class RestBackendService extends BackendService {
  private datastoreSubject = new BehaviorSubject<Datastore | null>(null);
  public datastore$: Observable<Datastore | null> = this.datastoreSubject.asObservable();
  
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();
  
  private apiBaseUrl: string = '/api'; // Configure this
  private currentMemberId: string = '';
  private currentMemberName: string = '';

  constructor() {
    super();
    // Poll for updates every 10 seconds (similar to refresh service)
    setInterval(() => this.checkForUpdates(), 10000);
  }

  async connect(): Promise<void> {
    // For REST API, connection might mean:
    // - Validate API is reachable
    // - Authenticate user
    // - Get initial data
    try {
      // Example: const response = await fetch(`${this.apiBaseUrl}/health`);
      // if (response.ok) {
      this.connectionStatusSubject.next(true);
      await this.loadDatastore();
      // }
    } catch (error) {
      console.error('Failed to connect to REST API:', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connectionStatusSubject.value;
  }

  setCurrentUser(memberId: string, displayName: string): void {
    this.currentMemberId = memberId;
    this.currentMemberName = displayName;
  }

  async loadDatastore(): Promise<void> {
    try {
      // Example REST call:
      // const response = await fetch(`${this.apiBaseUrl}/datastore`);
      // const datastore = await response.json();
      // this.datastoreSubject.next(datastore);
      
      // Placeholder implementation
      console.log('REST: Loading datastore from API');
    } catch (error) {
      console.error('Failed to load datastore from API:', error);
      throw error;
    }
  }

  getDatastore(): Datastore | null {
    return this.datastoreSubject.value;
  }

  async addTopic(topic: Topic): Promise<boolean> {
    try {
      // Example REST call:
      // const response = await fetch(`${this.apiBaseUrl}/topics`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(topic)
      // });
      // if (response.ok) {
      //   await this.loadDatastore();
      //   return true;
      // }
      console.log('REST: Adding topic via API', topic);
      return false;
    } catch (error) {
      console.error('Failed to add topic via API:', error);
      return false;
    }
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    try {
      // Example REST call:
      // const response = await fetch(`${this.apiBaseUrl}/topics/${topicId}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(updates)
      // });
      console.log('REST: Updating topic via API', topicId, updates);
      return false;
    } catch (error) {
      console.error('Failed to update topic via API:', error);
      return false;
    }
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    try {
      // Example REST call:
      // const response = await fetch(`${this.apiBaseUrl}/topics/${topicId}`, {
      //   method: 'DELETE'
      // });
      console.log('REST: Deleting topic via API', topicId);
      return false;
    } catch (error) {
      console.error('Failed to delete topic via API:', error);
      return false;
    }
  }

  async addMember(member: TeamMember): Promise<boolean> {
    try {
      console.log('REST: Adding member via API', member);
      return false;
    } catch (error) {
      console.error('Failed to add member via API:', error);
      return false;
    }
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    try {
      console.log('REST: Updating member via API', memberId, updates);
      return false;
    } catch (error) {
      console.error('Failed to update member via API:', error);
      return false;
    }
  }

  async deleteMember(memberId: string): Promise<boolean> {
    try {
      console.log('REST: Deleting member via API', memberId);
      return false;
    } catch (error) {
      console.error('Failed to delete member via API:', error);
      return false;
    }
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    try {
      // Example REST call:
      // const response = await fetch(`${this.apiBaseUrl}/topics/batch`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ updates })
      // });
      console.log('REST: Batch updating topics via API', updates);
      return false;
    } catch (error) {
      console.error('Failed to batch update topics via API:', error);
      return false;
    }
  }

  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async checkForUpdates(): Promise<void> {
    // Poll for datastore updates
    // Example: Check revision number and reload if changed
    if (this.isConnected()) {
      // await this.loadDatastore();
    }
  }
}
