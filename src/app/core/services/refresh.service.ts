import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { FileConnectionService } from './file-connection.service';
import { RefreshSignal } from '../models';

@Injectable({
  providedIn: 'root'
})
export class RefreshService {
  private lastRevisionId: number = -1;
  private lastTimestamp: string = '';
  private refreshTriggerSubject = new BehaviorSubject<RefreshSignal | null>(null);
  public refreshTrigger$: Observable<RefreshSignal | null> = this.refreshTriggerSubject.asObservable();

  constructor(private fileConnection: FileConnectionService) {
    // Poll every 10 seconds
    interval(10000).subscribe(() => {
      this.checkForRefresh();
    });
  }

  private async checkForRefresh(): Promise<void> {
    if (!this.fileConnection.isConnected()) {
      return;
    }

    try {
      const content = await this.fileConnection.readRefresh();
      if (!content) {
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
      // Ignore errors when checking refresh (file might not exist yet)
    }
  }

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
    
    // Update our local cache
    this.lastRevisionId = revisionId;
    this.lastTimestamp = signal.ts;
  }

  reset(): void {
    this.lastRevisionId = -1;
    this.lastTimestamp = '';
  }
}
