import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { Toolbar } from 'primeng/toolbar';
import { Tooltip } from 'primeng/tooltip';
import { BackendService } from '../../../core/services/backend.service';
import { LockService } from '../../../core/services/lock.service';
import { LockStatus } from '../../../core/services/lock.service';
import { DatastoreCommitService, WriteQueueStatus } from '../../../core/services';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [CommonModule, Button, Toolbar, Tooltip],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss'
})
export class StatusBarComponent implements OnInit {
  appLocation: string = '';
  revisionInfo: string = 'nicht geladen';
  lockStatusText: string = 'frei';
  connectivityText: string = 'nicht verbunden';
  isConnected: boolean = false;
  private lockStatus: LockStatus = { isLocked: false, isOwnLock: false };
  
  // Write queue status
  writeQueueStatus: WriteQueueStatus = {
    queueLength: 0,
    isProcessing: false,
    queuedOperations: []
  };

  constructor(
    private backend: BackendService,
    private lockService: LockService,
    private datastoreCommit: DatastoreCommitService
  ) {}

  ngOnInit(): void {
    // Set app location (try to derive from window.location)
    this.appLocation = this.getAppLocation();

    // Subscribe to connection status
    this.backend.connectionStatus$.subscribe(connected => {
      this.isConnected = connected;
      this.connectivityText = connected ? 'aktiv' : 'nicht verbunden';
    });

    // Subscribe to lock status
    this.lockService.lockStatus$.subscribe(status => {
      this.lockStatus = status;
      this.updateLockStatusText(status);
    });

    // Subscribe to datastore updates
    this.backend.datastore$.subscribe(datastore => {
      if (datastore) {
        const date = new Date(datastore.generatedAt);
        this.revisionInfo = `rev ${datastore.revisionId} / ${date.toLocaleString('de-DE')}`;
      }
    });
    
    // Subscribe to write queue status
    this.datastoreCommit.writeQueueStatus$.subscribe(status => {
      this.writeQueueStatus = status;
    });
  }

  connectFiles(): void {
    this.backend.connect()
      .catch(error => {
        console.error('Failed to connect:', error);
        alert('Fehler beim Verbinden: ' + error.message);
      });
  }

  getLockStatusClass(): string {
    if (!this.lockStatus.isLocked) {
      return 'lock-free';
    }
    return this.lockStatus.isOwnLock ? 'lock-own' : 'lock-held';
  }

  getConnectivityClass(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }
  
  hasOpenWrites(): boolean {
    return this.writeQueueStatus.queueLength > 0 || this.writeQueueStatus.isProcessing;
  }
  
  getWriteQueueTooltip(): string {
    if (!this.hasOpenWrites()) {
      return 'Keine offenen Schreibvorgänge';
    }
    
    let tooltip = `Schreibvorgänge: ${this.writeQueueStatus.isProcessing ? '1 aktiv' : '0 aktiv'}`;
    
    if (this.writeQueueStatus.queueLength > 0) {
      tooltip += `, ${this.writeQueueStatus.queueLength} in Warteschlange\n\nWarteschlange:`;
      this.writeQueueStatus.queuedOperations.forEach((op, index) => {
        const timeAgo = this.getTimeAgo(op.timestamp);
        const purposeText = this.getPurposeText(op.purpose);
        tooltip += `\n${index + 1}. ${purposeText} (${timeAgo})`;
      });
    }
    
    return tooltip;
  }
  
  getLockStatusTooltip(): string {
    if (!this.lockStatus.isLocked) {
      return 'Keine aktive Sperre';
    }
    
    if (this.lockStatus.isOwnLock) {
      return `Sie halten die Sperre\nVerbleibende Zeit: ${this.lockStatus.remainingSeconds} Sekunden`;
    }
    
    const holderName = this.lockStatus.lock?.lockedBy.displayName || 'Unbekannt';
    return `Sperre gehalten von: ${holderName}\nVerbleibende Zeit: ${this.lockStatus.remainingSeconds} Sekunden`;
  }
  
  private getPurposeText(purpose: string): string {
    const purposeMap: { [key: string]: string } = {
      'topic-save': 'Thema speichern',
      'member-save': 'Mitglied speichern',
      'assignment-save': 'Zuweisung speichern',
      'tag-save': 'Tag speichern'
    };
    return purposeMap[purpose] || purpose;
  }
  
  private getTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) {
      return `vor ${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    return `vor ${minutes}m`;
  }

  private updateLockStatusText(status: LockStatus): void {
    if (!status.isLocked) {
      this.lockStatusText = 'frei';
    } else if (status.isOwnLock) {
      this.lockStatusText = `von Ihnen (noch ${status.remainingSeconds} s)`;
    } else {
      const holderName = status.lock?.lockedBy.displayName || 'Unbekannt';
      this.lockStatusText = `${holderName} (noch ${status.remainingSeconds} s)`;
    }
  }

  private getAppLocation(): string {
    // Try to derive UNC path from window.location
    // When opened from UNC, the path might look like file:///server/share/app/
    const path = window.location.pathname;
    if (path.includes('/')) {
      // Convert file path to UNC-like display
      const parts = path.split('/').filter(p => p);
      if (parts.length >= 3) {
        return `\\\\${parts[0]}\\${parts[1]}\\${parts[2]}\\`;
      }
    }
    return window.location.origin || 'Lokaler Pfad';
  }
}
