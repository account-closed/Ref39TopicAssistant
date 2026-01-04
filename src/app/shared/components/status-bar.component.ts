import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { Toolbar } from 'primeng/toolbar';
import { BackendService } from '../../core/services/backend.service';
import { LockService } from '../../core/services/lock.service';
import { LockStatus } from '../../core/services/lock.service';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [CommonModule, Button, Toolbar],
  template: `
    <p-toolbar class="status-bar">
      <ng-template pTemplate="start">
        <div class="status-items">
          <span class="status-item">
            <i class="pi pi-folder"></i>
            <strong>App:</strong> {{ appLocation }}
          </span>
          <span class="status-item">
            <i class="pi pi-database"></i>
            <strong>Datenstand:</strong> 
            {{ revisionInfo }}
          </span>
          <span class="status-item">
            <i class="pi pi-lock"></i>
            <strong>Sperre:</strong> 
            <span [class]="getLockStatusClass()">{{ lockStatusText }}</span>
          </span>
          <span class="status-item">
            <i class="pi pi-wifi"></i>
            <strong>Schreibzugriff:</strong> 
            <span [class]="getConnectivityClass()">{{ connectivityText }}</span>
          </span>
        </div>
      </ng-template>
      <ng-template pTemplate="end">
        <p-button 
          label="Dateien verbinden" 
          icon="pi pi-link" 
          (onClick)="connectFiles()"
          [disabled]="isConnected"
          severity="info"
          size="small">
        </p-button>
      </ng-template>
    </p-toolbar>
  `,
  styles: [`
    .status-bar {
      border-radius: 0;
      background: #f8f9fa;
      border-top: 1px solid #dee2e6;
      padding: 0.5rem 1rem;
    }

    .status-items {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .status-item i {
      color: #6c757d;
    }

    .status-item strong {
      font-weight: 600;
    }

    .lock-free {
      color: #28a745;
    }

    .lock-held {
      color: #dc3545;
    }

    .lock-own {
      color: #007bff;
    }

    .connected {
      color: #28a745;
    }

    .disconnected {
      color: #dc3545;
    }
  `]
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
