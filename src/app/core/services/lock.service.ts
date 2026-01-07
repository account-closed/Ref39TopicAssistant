import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { FileConnectionService, FileConnectionError } from './file-connection.service';
import { Lock, LockPurpose, LockHolder } from '../models';

export interface LockStatus {
  isLocked: boolean;
  isOwnLock: boolean;
  lock?: Lock;
  remainingSeconds?: number;
}

export interface LockAcquireResult {
  success: boolean;
  germanMessage: string;
  lockHolder?: LockHolder;
  remainingSeconds?: number;
}

const LOCK_TTL_SECONDS = 120;
const LOCK_RENEWAL_INTERVAL_MS = 30000; // 30 seconds
const LOCK_STATUS_POLL_INTERVAL_MS = 1000; // 1 second
const LOCK_VERIFICATION_DELAY_MS = 2000; // Wait 2 seconds before verifying lock acquisition (increased for antivirus delays)
const LOCK_ACQUIRE_MAX_RETRIES = 3; // Maximum number of lock acquisition attempts

@Injectable({
  providedIn: 'root'
})
export class LockService implements OnDestroy {
  private lockStatusSubject = new BehaviorSubject<LockStatus>({ isLocked: false, isOwnLock: false });
  public lockStatus$: Observable<LockStatus> = this.lockStatusSubject.asObservable();
  
  private clientId: string;
  private currentMemberId: string = '';
  private currentMemberName: string = '';
  private renewalInterval?: ReturnType<typeof setInterval>;
  private statusPollSubscription?: Subscription;

  constructor(private fileConnection: FileConnectionService) {
    this.clientId = this.generateUUID();
    
    // Update lock status every second when connected
    this.statusPollSubscription = interval(LOCK_STATUS_POLL_INTERVAL_MS).subscribe(() => {
      if (this.fileConnection.isConnected()) {
        this.updateLockStatus();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopRenewal();
    this.statusPollSubscription?.unsubscribe();
  }

  setCurrentMember(memberId: string, displayName?: string): void {
    this.currentMemberId = memberId;
    if (displayName) {
      this.currentMemberName = displayName;
    }
  }

  setCurrentMemberName(displayName: string): void {
    this.currentMemberName = displayName;
  }

  /**
   * Acquire lock following the specification:
   * 1. Read lock.json (if missing: treat as unlocked)
   * 2. If now minus lockedAt is less than ttlSeconds: block editing
   * 3. If unlocked or stale: write lock, wait, re-read and verify
   * 
   * Retries with exponential backoff for transient errors.
   */
  async acquireLock(purpose: LockPurpose, lockHolder?: LockHolder): Promise<LockAcquireResult> {
    const holder = lockHolder || {
      memberId: this.currentMemberId,
      displayName: this.currentMemberName
    };

    for (let attempt = 0; attempt < LOCK_ACQUIRE_MAX_RETRIES; attempt++) {
      try {
        // Step 1: Read current lock
        const existingLock = await this.readLockFile();

        // Step 2: Check if locked and not stale
        if (existingLock && !this.isLockStale(existingLock)) {
          const remainingSeconds = this.getRemainingSeconds(existingLock);
          return {
            success: false,
            germanMessage: `Sperre aktiv von ${existingLock.lockedBy.displayName}. Noch ${remainingSeconds} Sekunden.`,
            lockHolder: existingLock.lockedBy,
            remainingSeconds
          };
        }

        // Step 3: Write new lock
        const newLock: Lock = {
          lockedAt: new Date().toISOString(),
          ttlSeconds: LOCK_TTL_SECONDS,
          lockedBy: holder,
          clientId: this.clientId,
          purpose
        };

        await this.fileConnection.writeLock(JSON.stringify(newLock, null, 2));

        // Step 4: Wait before verification to detect race conditions (increased delay for antivirus)
        await this.sleep(LOCK_VERIFICATION_DELAY_MS);

        // Step 5: Re-read and verify
        const verifyLock = await this.readLockFile();

        if (verifyLock && verifyLock.clientId === this.clientId) {
          // Successfully acquired lock
          await this.updateLockStatus();
          this.startRenewal(purpose, holder);
          
          if (attempt > 0) {
            console.log(`[Lock] Lock acquired after ${attempt} retries`);
          }
          
          return {
            success: true,
            germanMessage: 'Sperre erfolgreich erworben.'
          };
        }

        // Another client won the race - this is expected behavior, not an error to retry
        return {
          success: false,
          germanMessage: 'Ein anderer Benutzer hat die Sperre erworben. Bitte versuchen Sie es erneut.',
          lockHolder: verifyLock?.lockedBy,
          remainingSeconds: verifyLock ? this.getRemainingSeconds(verifyLock) : undefined
        };
      } catch (error) {
        // If this was the last attempt, return the error
        if (attempt === LOCK_ACQUIRE_MAX_RETRIES - 1) {
          console.error('Failed to acquire lock after all retries:', error);
          if (error instanceof FileConnectionError) {
            return {
              success: false,
              germanMessage: error.germanMessage
            };
          }
          return {
            success: false,
            germanMessage: 'Fehler beim Erwerben der Sperre: ' + (error as Error).message
          };
        }
        
        // Calculate delay with exponential backoff
        const delayMs = 500 * Math.pow(2, attempt);
        console.warn(`[Lock] Lock acquisition failed (attempt ${attempt + 1}/${LOCK_ACQUIRE_MAX_RETRIES}), retrying in ${delayMs}ms:`, error);
        
        // Wait before retrying
        await this.sleep(delayMs);
      }
    }
    
    // This should never be reached, but TypeScript needs it
    return {
      success: false,
      germanMessage: 'Fehler beim Erwerben der Sperre nach allen Wiederholungsversuchen.'
    };
  }

  /**
   * Release lock by writing a stale lock (lockedAt = 1970-01-01T00:00:00Z).
   * Retries to ensure the lock is released even with transient errors.
   */
  async releaseLock(): Promise<void> {
    this.stopRenewal();
    
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Write stale lock to unlock reliably
        const staleLock: Lock = {
          lockedAt: '1970-01-01T00:00:00Z',
          ttlSeconds: LOCK_TTL_SECONDS,
          lockedBy: { memberId: '', displayName: '' },
          clientId: '',
          purpose: 'topic-save'
        };

        await this.fileConnection.writeLock(JSON.stringify(staleLock, null, 2));
        await this.updateLockStatus();
        
        if (attempt > 0) {
          console.log(`[Lock] Lock released after ${attempt} retries`);
        }
        return;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          console.error('Failed to release lock after all retries:', error);
          // Don't throw - best effort release
          return;
        }
        
        const delayMs = 200 * Math.pow(2, attempt);
        console.warn(`[Lock] Lock release failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms:`, error);
        await this.sleep(delayMs);
      }
    }
  }

  /**
   * Renew the lock (extend lock periodically while editing).
   * Retries with exponential backoff for transient errors.
   */
  async renewLock(): Promise<boolean> {
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const currentLock = await this.readLockFile();

        if (currentLock && currentLock.clientId === this.clientId) {
          currentLock.lockedAt = new Date().toISOString();
          await this.fileConnection.writeLock(JSON.stringify(currentLock, null, 2));
          await this.updateLockStatus();
          
          if (attempt > 0) {
            console.log(`[Lock] Lock renewed after ${attempt} retries`);
          }
          return true;
        }
        return false;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          console.error('Failed to renew lock after all retries:', error);
          return false;
        }
        
        const delayMs = 200 * Math.pow(2, attempt);
        console.warn(`[Lock] Lock renewal failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms:`, error);
        await this.sleep(delayMs);
      }
    }
    
    return false;
  }

  /**
   * Check if we currently hold the lock.
   */
  async hasOwnLock(): Promise<boolean> {
    try {
      const lock = await this.readLockFile();
      return lock !== null && lock.clientId === this.clientId && !this.isLockStale(lock);
    } catch {
      return false;
    }
  }

  /**
   * Get current lock status synchronously.
   */
  getLockStatus(): LockStatus {
    return this.lockStatusSubject.value;
  }

  private startRenewal(purpose: LockPurpose, holder: LockHolder): void {
    this.stopRenewal();
    // Renew every 30 seconds while there are unsaved changes
    this.renewalInterval = setInterval(() => {
      this.renewLock();
    }, LOCK_RENEWAL_INTERVAL_MS);
  }

  private stopRenewal(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = undefined;
    }
  }

  private async updateLockStatus(): Promise<void> {
    try {
      const lock = await this.readLockFile();
      
      if (!lock) {
        this.lockStatusSubject.next({ isLocked: false, isOwnLock: false });
        return;
      }

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

  private async readLockFile(): Promise<Lock | null> {
    try {
      const content = await this.fileConnection.readLock();
      if (!content || content.trim() === '') {
        return null;
      }
      return JSON.parse(content) as Lock;
    } catch (error) {
      // File doesn't exist or invalid JSON - treat as unlocked
      return null;
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
