import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { Toolbar } from 'primeng/toolbar';
import { BackendService } from '../../../core/services/backend.service';
import { LockService } from '../../../core/services/lock.service';
import { LockStatus } from '../../../core/services/lock.service';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [CommonModule, Button, Toolbar],
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

  constructor(
    private backend: BackendService,
    private lockService: LockService
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
