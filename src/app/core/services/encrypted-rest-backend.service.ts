import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BackendService } from './backend.service';
import { Datastore, Topic, TeamMember, Tag, EncryptedPayload } from '../models';
import { EncryptionService } from './encryption.service';
import { ConfigService } from './config.service';

/**
 * Encrypted REST API backend implementation.
 *
 * Features:
 * - End-to-end encryption with PSK (zero-knowledge backend)
 * - API key authentication
 * - Multi-instance support
 *
 * To use this implementation:
 * 1. Update app.config.ts to provide EncryptedRestBackendService
 * 2. Configure via ConfigService (API URL, API key, PSK)
 * 3. No component changes needed!
 */
@Injectable({
  providedIn: 'root'
})
export class EncryptedRestBackendService extends BackendService {
  private encryptionService = inject(EncryptionService);
  private configService = inject(ConfigService);

  private datastoreSubject = new BehaviorSubject<Datastore | null>(null);
  public datastore$: Observable<Datastore | null> = this.datastoreSubject.asObservable();

  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();

  private currentMemberId: string = '';
  private currentMemberName: string = '';

  constructor() {
    super();
    // Poll for updates every 10 seconds (similar to refresh service)
    setInterval(() => this.checkForUpdates(), 10000);
  }

  async connect(): Promise<void> {
    const config = this.configService.getConfig();
    if (!config) {
      throw new Error('No instance configuration found. Please configure first.');
    }

    const errors = this.configService.validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }

    try {
      // Test connection with health check
      const response = await fetch(`${config.apiUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Instance-Id': config.instanceId
        }
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
      }

      this.connectionStatusSubject.next(true);
      await this.loadDatastore();
    } catch (error) {
      console.error('Failed to connect to encrypted REST API:', error);
      this.connectionStatusSubject.next(false);
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
    const config = this.configService.getConfig();
    if (!config) {
      throw new Error('No configuration found');
    }

    try {
      const response = await fetch(`${config.apiUrl}/instances/${config.instanceId}/datastore`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Instance-Id': config.instanceId
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load datastore: ${response.status} ${response.statusText}`);
      }

      const encryptedPayload: EncryptedPayload = await response.json();
      const datastore = await this.encryptionService.decrypt<Datastore>(encryptedPayload, config.psk);

      this.datastoreSubject.next(datastore);
    } catch (error) {
      console.error('Failed to load datastore from API:', error);
      throw error;
    }
  }

  getDatastore(): Datastore | null {
    return this.datastoreSubject.value;
  }

  private async makeEncryptedRequest(
    endpoint: string,
    method: string,
    data?: unknown
  ): Promise<boolean> {
    const config = this.configService.getConfig();
    if (!config) {
      console.error('No configuration found');
      return false;
    }

    try {
      let body: string | undefined;
      if (data) {
        const encryptedPayload = await this.encryptionService.encrypt(data, config.psk);
        body = JSON.stringify(encryptedPayload);
      }

      const response = await fetch(`${config.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Instance-Id': config.instanceId
        },
        body
      });

      if (response.ok) {
        await this.loadDatastore();
        return true;
      }

      console.error(`Request failed: ${response.status} ${response.statusText}`);
      return false;
    } catch (error) {
      console.error('Request error:', error);
      return false;
    }
  }

  async addTopic(topic: Topic): Promise<boolean> {
    return this.makeEncryptedRequest('/topics', 'POST', topic);
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    return this.makeEncryptedRequest(`/topics/${topicId}`, 'PATCH', updates);
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    return this.makeEncryptedRequest(`/topics/${topicId}`, 'DELETE');
  }

  async addMember(member: TeamMember): Promise<boolean> {
    return this.makeEncryptedRequest('/members', 'POST', member);
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    return this.makeEncryptedRequest(`/members/${memberId}`, 'PATCH', updates);
  }

  async deleteMember(memberId: string): Promise<boolean> {
    return this.makeEncryptedRequest(`/members/${memberId}`, 'DELETE');
  }

  async addTag(tag: Tag): Promise<boolean> {
    return this.makeEncryptedRequest('/tags', 'POST', tag);
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<boolean> {
    return this.makeEncryptedRequest(`/tags/${tagId}`, 'PATCH', updates);
  }

  async deleteTag(tagId: string): Promise<boolean> {
    return this.makeEncryptedRequest(`/tags/${tagId}`, 'DELETE');
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    return this.makeEncryptedRequest('/topics/batch', 'PATCH', { updates });
  }

  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async checkForUpdates(): Promise<void> {
    if (this.isConnected()) {
      try {
        const config = this.configService.getConfig();
        if (!config) return;

        // Check revision number to see if reload is needed
        const response = await fetch(
          `${config.apiUrl}/instances/${config.instanceId}/revision`,
          {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'X-Instance-Id': config.instanceId
            }
          }
        );

        if (response.ok) {
          const { revisionId } = await response.json();
          const currentDatastore = this.datastoreSubject.value;

          if (currentDatastore && revisionId !== currentDatastore.revisionId) {
            // Revision changed, reload datastore
            await this.loadDatastore();
          }
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    }
  }
}
