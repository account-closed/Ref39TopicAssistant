import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { FileConnectionService } from './file-connection.service';
import { RefreshSignal } from '../models';

const REFRESH_POLL_INTERVAL_MS = 10000; // 10 seconds

@Injectable({
  providedIn: 'root'
})
export class RefreshService implements OnDestroy {
  private lastRevisionId: number = -1;
  private lastTimestamp: string = '';
  private refreshTriggerSubject = new BehaviorSubject<RefreshSignal | null>(null);
  public refreshTrigger$: Observable<RefreshSignal | null> = this.refreshTriggerSubject.asObservable();
  
  private pollSubscription?: Subscription;

  constructor(private fileConnection: FileConnectionService) {
    // Poll every 10 seconds
    this.pollSubscription = interval(REFRESH_POLL_INTERVAL_MS).subscribe(() => {
      this.checkForRefresh();
    });
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
  }

  /**
   * Manually trigger a refresh check.
   */
  async checkForRefresh(): Promise<void> {
    if (!this.fileConnection.isConnected()) {
      return;
    }

    try {
      const content = await this.fileConnection.readRefresh();
      if (!content || content.trim() === '') {
        return;
      }

      const signal = JSON.parse(content) as RefreshSignal;

      // Check if revision or timestamp changed
      if (signal.revisionId !== this.lastRevisionId || signal.ts !== this.lastTimestamp) {
        this.lastRevisionId = signal.revisionId;
        this.lastTimestamp = signal.ts;
        this.refreshTriggerSubject.next(signal);
      }
    } catch (error) {
      // Ignore errors when checking refresh (file might not exist yet or be invalid)
      console.debug('Refresh check skipped:', error);
    }
  }

  /**
   * Write refresh signal after successful commit.
   * Content must include revisionId, ts (ISO timestamp), and by (memberId/displayName).
   */
  async writeRefreshSignal(revisionId: number, memberId: string, displayName: string): Promise<void> {
    const signal: RefreshSignal = {
      revisionId,
      ts: new Date().toISOString(),
      by: {
        memberId,
        displayName
      }
    };

    await this.fileConnection.writeRefresh(JSON.stringify(signal, null, 2));
    
    // Update our local cache to avoid triggering self-refresh
    this.lastRevisionId = revisionId;
    this.lastTimestamp = signal.ts;
  }

  /**
   * Reset the refresh state (e.g., when reconnecting).
   */
  reset(): void {
    this.lastRevisionId = -1;
    this.lastTimestamp = '';
    this.refreshTriggerSubject.next(null);
  }

  /**
   * Get the last known revision ID.
   */
  getLastRevisionId(): number {
    return this.lastRevisionId;
  }

  /**
   * Initialize refresh state from current datastore.
   */
  initializeFromRevision(revisionId: number, timestamp: string): void {
    this.lastRevisionId = revisionId;
    this.lastTimestamp = timestamp;
  }
}
