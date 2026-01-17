import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { BackendService } from './backend.service';
import { Datastore, Topic, TeamMember, Tag } from '../models';
import { FileConnectionService } from './file-connection.service';
import { CacheService } from './cache.service';
import { PersistenceService } from './persistence.service';

/**
 * File System Access API implementation of the backend.
 * 
 * Architecture:
 *   UI + Index  <-->  Cache  <-->  PersistenceService  <-->  Backend (File)
 * 
 * Core Principles:
 * - The cache (CacheService) is the single source of truth
 * - All reads come from the cache
 * - All writes go to the cache first
 * - Backend persistence is asynchronous via PersistenceService
 */
@Injectable({
  providedIn: 'root'
})
export class FileSystemBackendService extends BackendService {
  /**
   * Observable of the current datastore from cache.
   * This is the ONLY source of truth for the UI.
   */
  public datastore$: Observable<Datastore | null>;
  
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  public connectionStatus$: Observable<boolean> = this.connectionStatusSubject.asObservable();

  private fileConnection = inject(FileConnectionService);
  private cache = inject(CacheService);
  private persistence = inject(PersistenceService);

  constructor() {
    super();
    
    // The datastore observable comes directly from the cache
    this.datastore$ = this.cache.datastore$;

    // Listen for connection changes
    this.fileConnection.connection$.subscribe(connection => {
      this.connectionStatusSubject.next(connection.connected);
    });
  }

  async connect(): Promise<void> {
    const result = await this.persistence.connect();
    if (!result.success) {
      console.error('Failed to connect:', result.germanMessage);
    }
  }

  isConnected(): boolean {
    return this.persistence.isConnected();
  }

  setCurrentUser(memberId: string, displayName: string): void {
    this.persistence.setCurrentUser(memberId, displayName);
  }

  async loadDatastore(): Promise<void> {
    const result = await this.persistence.loadFromBackend();
    if (!result.success) {
      console.error('Failed to load datastore:', result.germanMessage);
    }
  }

  /**
   * Get current datastore from cache.
   * This always returns the current cache state.
   */
  getDatastore(): Datastore | null {
    return this.cache.getDatastore();
  }

  // ==================== TOPIC OPERATIONS ====================
  // All writes go to cache first, then persist asynchronously

  async addTopic(topic: Topic): Promise<boolean> {
    const result = this.cache.addTopic(topic);
    return result.success;
  }

  async updateTopic(topicId: string, updates: Partial<Topic>): Promise<boolean> {
    const result = this.cache.updateTopic(topicId, updates);
    return result.success;
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    const result = this.cache.deleteTopic(topicId);
    return result.success;
  }

  async updateMultipleTopics(updates: Array<{ topicId: string; changes: Partial<Topic> }>): Promise<boolean> {
    const result = this.cache.updateMultipleTopics(updates);
    return result.success;
  }

  // ==================== MEMBER OPERATIONS ====================

  async addMember(member: TeamMember): Promise<boolean> {
    const result = this.cache.addMember(member);
    return result.success;
  }

  async updateMember(memberId: string, updates: Partial<TeamMember>): Promise<boolean> {
    const result = this.cache.updateMember(memberId, updates);
    return result.success;
  }

  async deleteMember(memberId: string): Promise<boolean> {
    const result = this.cache.deleteMember(memberId);
    return result.success;
  }

  // ==================== TAG OPERATIONS ====================

  async addTag(tag: Tag): Promise<boolean> {
    const result = this.cache.addTag(tag);
    return result.success;
  }

  async updateTag(tagId: string, updates: Partial<Tag>): Promise<boolean> {
    const result = this.cache.updateTag(tagId, updates);
    return result.success;
  }

  async deleteTag(tagId: string): Promise<boolean> {
    const result = this.cache.deleteTag(tagId);
    return result.success;
  }

  generateUUID(): string {
    return this.persistence.generateUUID();
  }
}
