import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { FileConnectionService } from './file-connection.service';
import { Lock, LockPurpose, LockHolder } from '../models';

export interface LockStatus {
  isLocked: boolean;
  isOwnLock: boolean;
  lock?: Lock;
  remainingSeconds?: number;
}

@Injectable({
  providedIn: 'root'
})
export class LockService {
  private lockStatusSubject = new BehaviorSubject<LockStatus>({ isLocked: false, isOwnLock: false });
  public lockStatus$: Observable<LockStatus> = this.lockStatusSubject.asObservable();
  private clientId: string;
  private currentMemberId: string = '';
  private renewalInterval?: any;

  constructor(private fileConnection: FileConnectionService) {
    this.clientId = this.generateUUID();
    
    // Update lock status every second
    interval(1000).subscribe(() => {
      this.updateLockStatus();
    });
  }

  setCurrentMember(memberId: string): void {
    this.currentMemberId = memberId;
  }

  async acquireLock(purpose: LockPurpose, lockHolder: LockHolder): Promise<boolean> {
    try {
      // Step 1: Read current lock
      const lockContent = await this.readLockFile();
      const existingLock = lockContent ? JSON.parse(lockContent) as Lock : null;

      // Step 2: Check if locked and not stale
      if (existingLock && !this.isLockStale(existingLock)) {
        return false; // Lock is held by someone else
      }

      // Step 3: Write new lock
      const newLock: Lock = {
        lockedAt: new Date().toISOString(),
        ttlSeconds: 120,
        lockedBy: lockHolder,
        clientId: this.clientId,
        purpose
      };

      await this.fileConnection.writeLock(JSON.stringify(newLock, null, 2));

      // Step 4: Wait 1 second
      await this.sleep(1000);

      // Step 5: Re-read and verify
      const verifyContent = await this.readLockFile();
      const verifyLock = verifyContent ? JSON.parse(verifyContent) as Lock : null;

      if (verifyLock && verifyLock.clientId === this.clientId) {
        // Successfully acquired lock
        this.updateLockStatus();
        this.startRenewal();
        return true;
      }

      return false; // Another client won
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      return false;
    }
  }

  async releaseLock(): Promise<void> {
    try {
      this.stopRenewal();
      
      // Write stale lock to unlock
      const staleLock: Lock = {
        lockedAt: '1970-01-01T00:00:00Z',
        ttlSeconds: 120,
        lockedBy: { memberId: '', displayName: '' },
        clientId: '',
        purpose: 'topic-save'
      };

      await this.fileConnection.writeLock(JSON.stringify(staleLock, null, 2));
      this.updateLockStatus();
    } catch (error) {
      console.error('Failed to release lock:', error);
    }
  }

  async renewLock(): Promise<void> {
    try {
      const lockContent = await this.readLockFile();
      const currentLock = lockContent ? JSON.parse(lockContent) as Lock : null;

      if (currentLock && currentLock.clientId === this.clientId) {
        currentLock.lockedAt = new Date().toISOString();
        await this.fileConnection.writeLock(JSON.stringify(currentLock, null, 2));
        this.updateLockStatus();
      }
    } catch (error) {
      console.error('Failed to renew lock:', error);
    }
  }

  private startRenewal(): void {
    this.stopRenewal();
    // Renew every 30 seconds
    this.renewalInterval = setInterval(() => {
      this.renewLock();
    }, 30000);
  }

  private stopRenewal(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = undefined;
    }
  }

  private async updateLockStatus(): Promise<void> {
    try {
      const lockContent = await this.readLockFile();
      
      if (!lockContent) {
        this.lockStatusSubject.next({ isLocked: false, isOwnLock: false });
        return;
      }

      const lock = JSON.parse(lockContent) as Lock;
      const isStale = this.isLockStale(lock);
      
      if (isStale) {
        this.lockStatusSubject.next({ isLocked: false, isOwnLock: false });
        return;
      }

      const isOwnLock = lock.clientId === this.clientId;
      const remainingSeconds = this.getRemainingSeconds(lock);

      this.lockStatusSubject.next({
        isLocked: true,
        isOwnLock,
        lock,
        remainingSeconds
      });
    } catch (error) {
      // If file doesn't exist or can't be read, treat as unlocked
      this.lockStatusSubject.next({ isLocked: false, isOwnLock: false });
    }
  }

  private isLockStale(lock: Lock): boolean {
    const lockedAt = new Date(lock.lockedAt);
    const now = new Date();
    const ageSeconds = (now.getTime() - lockedAt.getTime()) / 1000;
    return ageSeconds >= lock.ttlSeconds;
  }

  private getRemainingSeconds(lock: Lock): number {
    const lockedAt = new Date(lock.lockedAt);
    const now = new Date();
    const ageSeconds = (now.getTime() - lockedAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(lock.ttlSeconds - ageSeconds));
  }

  private async readLockFile(): Promise<string | null> {
    try {
      return await this.fileConnection.readLock();
    } catch (error) {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
