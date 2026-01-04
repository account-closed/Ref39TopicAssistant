import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { Divider } from 'primeng/divider';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { FileConnectionService } from '../../core/services/file-connection.service';
import { Datastore } from '../../core/models';

type BackendType = 'filesystem' | 'rest';

interface BackendOption {
  label: string;
  value: BackendType;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, Card, Button, SelectButton, Divider, Tag, Message],
  template: `
    <div class="page-container">
      <h1>Einstellungen / Status</h1>

      <!-- Connection Status Card -->
      <p-card header="Verbindungsstatus" styleClass="mb-4">
        <div class="status-grid">
          <div class="status-row">
            <span class="status-label">Backend-Typ:</span>
            <p-tag [value]="backendTypeDisplay" [severity]="isConnected ? 'success' : 'secondary'"></p-tag>
          </div>
          <div class="status-row">
            <span class="status-label">Verbindungsstatus:</span>
            <p-tag [value]="isConnected ? 'Verbunden' : 'Nicht verbunden'" [severity]="isConnected ? 'success' : 'danger'"></p-tag>
          </div>
          <div class="status-row" *ngIf="dataDirectoryName">
            <span class="status-label">Datenverzeichnis:</span>
            <span class="status-value">{{ dataDirectoryName }}</span>
          </div>
          <div class="status-row" *ngIf="datastoreInfo">
            <span class="status-label">Datenstand:</span>
            <span class="status-value">{{ datastoreInfo }}</span>
          </div>
          <div class="status-row" *ngIf="topicsCount !== null">
            <span class="status-label">Themen:</span>
            <span class="status-value">{{ topicsCount }}</span>
          </div>
          <div class="status-row" *ngIf="membersCount !== null">
            <span class="status-label">Teammitglieder:</span>
            <span class="status-value">{{ membersCount }}</span>
          </div>
        </div>
      </p-card>

      <!-- Data Directory Card -->
      <p-card header="Datenverzeichnis" styleClass="mb-4">
        <p class="mb-3">
          Wählen Sie ein Verzeichnis für die Datenspeicherung. 
          Das Verzeichnis sollte für alle Benutzer zugänglich sein (z.B. SMB-Freigabe).
        </p>
        
        <div class="action-row mb-3">
          <p-button 
            label="Verzeichnis auswählen" 
            icon="pi pi-folder-open" 
            (onClick)="selectDataDirectory()"
            [loading]="isConnecting"
            severity="primary">
          </p-button>
          <span class="current-dir" *ngIf="dataDirectoryName">
            <i class="pi pi-check-circle" style="color: var(--green-500);"></i>
            {{ dataDirectoryName }}
          </span>
        </div>

        <p-message *ngIf="!isConnected" severity="info">
          Bitte wählen Sie ein Datenverzeichnis aus, um die Anwendung zu verwenden.
        </p-message>

        <p-divider></p-divider>

        <h4>Verzeichnis initialisieren</h4>
        <p class="mb-3">
          Wenn das ausgewählte Verzeichnis leer ist, können Sie es mit den erforderlichen Dateien initialisieren.
        </p>
        
        <p-button 
          label="Verzeichnis initialisieren (Bootstrap)" 
          icon="pi pi-refresh" 
          (onClick)="bootstrapDataDirectory()"
          [disabled]="!isConnected || !canBootstrap"
          [loading]="isBootstrapping"
          severity="secondary">
        </p-button>
        
        <p-message *ngIf="isConnected && canBootstrap" severity="warn" styleClass="mt-3">
          Das Verzeichnis enthält bereits Daten. Ein Bootstrap würde diese überschreiben.
        </p-message>
        <p-message *ngIf="bootstrapMessage" [severity]="bootstrapMessageSeverity" styleClass="mt-3">
          {{ bootstrapMessage }}
        </p-message>
      </p-card>

      <!-- Backend Type Selection Card -->
      <p-card header="Backend-Konfiguration" styleClass="mb-4">
        <p class="mb-3">
          Wählen Sie den Backend-Typ für die Datenspeicherung. 
          <strong>Hinweis:</strong> Um den Backend-Typ dauerhaft zu ändern, 
          muss die Anwendung neu konfiguriert werden (siehe BACKEND_MIGRATION.md).
        </p>
        
        <div class="backend-selector mb-3">
          <p-selectButton 
            [options]="backendOptions" 
            [(ngModel)]="selectedBackendType"
            [disabled]="true"
            optionLabel="label" 
            optionValue="value">
          </p-selectButton>
        </div>

        <p-message severity="info">
          Der Backend-Typ ist derzeit auf <strong>{{ backendTypeDisplay }}</strong> festgelegt. 
          Um zum REST-Backend zu wechseln, folgen Sie der Anleitung in BACKEND_MIGRATION.md.
        </p-message>

        <p-divider></p-divider>

        <h4>REST API Konfiguration (Platzhalter)</h4>
        <p class="mb-3 text-muted">
          Diese Funktion wird in einer zukünftigen Version verfügbar sein.
          Wenn aktiviert, können Sie hier die URL des REST-Backends konfigurieren.
        </p>
        <div class="rest-config-placeholder">
          <label>API Base URL:</label>
          <input type="text" class="rest-url-input" value="/api" disabled placeholder="https://api.example.com/api" />
          <p-button 
            label="Verbindung testen" 
            icon="pi pi-check" 
            severity="secondary"
            [disabled]="true"
            size="small">
          </p-button>
        </div>
      </p-card>

      <!-- Diagnostics Card -->
      <p-card header="Diagnose" styleClass="mb-4">
        <div class="status-grid">
          <div class="status-row">
            <span class="status-label">Browser:</span>
            <span class="status-value">{{ browserInfo }}</span>
          </div>
          <div class="status-row">
            <span class="status-label">File System Access API:</span>
            <p-tag [value]="hasFileSystemAPI ? 'Unterstützt' : 'Nicht unterstützt'" [severity]="hasFileSystemAPI ? 'success' : 'danger'"></p-tag>
          </div>
          <div class="status-row">
            <span class="status-label">App Version:</span>
            <span class="status-value">0.0.0</span>
          </div>
        </div>
      </p-card>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 800px;
    }

    .mb-3 {
      margin-bottom: 1rem;
    }

    .mb-4 {
      margin-bottom: 1.5rem;
    }

    .mt-3 {
      margin-top: 1rem;
    }

    .status-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-label {
      font-weight: 600;
      min-width: 150px;
      color: var(--text-color-secondary);
    }

    .status-value {
      color: var(--text-color);
    }

    .action-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .current-dir {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-color-secondary);
    }

    .backend-selector {
      display: flex;
      align-items: center;
    }

    .rest-config-placeholder {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      opacity: 0.6;
    }

    .rest-config-placeholder label {
      font-weight: 600;
      min-width: 100px;
    }

    .rest-url-input {
      flex: 1;
      min-width: 200px;
      padding: 0.5rem;
      border: 1px solid var(--surface-border);
      border-radius: var(--border-radius);
      background: var(--surface-ground);
    }

    .text-muted {
      color: var(--text-color-secondary);
    }

    h4 {
      margin-top: 0;
      margin-bottom: 0.5rem;
    }
  `]
})
export class SettingsComponent implements OnInit, OnDestroy {
  // Connection status
  isConnected = false;
  isConnecting = false;
  dataDirectoryName = '';
  datastoreInfo = '';
  topicsCount: number | null = null;
  membersCount: number | null = null;

  // Bootstrap
  isBootstrapping = false;
  canBootstrap = false;
  bootstrapMessage = '';
  bootstrapMessageSeverity: 'success' | 'info' | 'warn' | 'error' = 'info';

  // Backend type
  backendTypeDisplay = 'Dateisystem';
  selectedBackendType: BackendType = 'filesystem';
  backendOptions: BackendOption[] = [
    { label: 'Dateisystem', value: 'filesystem' },
    { label: 'REST API', value: 'rest' }
  ];

  // Diagnostics
  browserInfo = '';
  hasFileSystemAPI = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private fileConnection: FileConnectionService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    // Check File System API support
    this.hasFileSystemAPI = 'showDirectoryPicker' in window;
    this.browserInfo = navigator.userAgent.split(' ').slice(-2).join(' ');

    // Subscribe to connection status
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
        this.updateDirectoryInfo();
      })
    );

    // Subscribe to datastore updates
    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        this.updateDatastoreInfo(datastore);
      })
    );

    // Subscribe to file connection for directory name
    this.subscriptions.push(
      this.fileConnection.connection$.subscribe(connection => {
        if (connection.directoryHandle) {
          this.dataDirectoryName = connection.directoryHandle.name;
        } else {
          this.dataDirectoryName = '';
        }
        this.checkCanBootstrap();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async selectDataDirectory(): Promise<void> {
    this.isConnecting = true;
    this.bootstrapMessage = '';
    try {
      await this.backend.connect();
      this.messageService.add({
        severity: 'success',
        summary: 'Verbunden',
        detail: 'Erfolgreich mit dem Datenverzeichnis verbunden.'
      });
      this.checkCanBootstrap();
    } catch (error) {
      console.error('Failed to connect:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: 'Verbindung zum Verzeichnis fehlgeschlagen: ' + (error as Error).message
      });
    } finally {
      this.isConnecting = false;
    }
  }

  async bootstrapDataDirectory(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.isBootstrapping = true;
    this.bootstrapMessage = '';
    
    try {
      // Create empty datastore
      const emptyDatastore: Datastore = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        revisionId: 0,
        members: [],
        topics: []
      };

      // Write datastore.json
      await this.fileConnection.writeDatastore(JSON.stringify(emptyDatastore, null, 2));

      // Write lock.json (stale lock)
      const staleLock = {
        lockedAt: '1970-01-01T00:00:00Z',
        ttlSeconds: 120,
        lockedBy: { memberId: '', displayName: '' },
        clientId: '',
        purpose: 'topic-save'
      };
      await this.fileConnection.writeLock(JSON.stringify(staleLock, null, 2));

      // Write refresh.json
      const refreshSignal = {
        revisionId: 0,
        ts: new Date().toISOString(),
        by: { memberId: '', displayName: 'System' }
      };
      await this.fileConnection.writeRefresh(JSON.stringify(refreshSignal, null, 2));

      // Reload datastore
      await this.backend.loadDatastore();

      this.bootstrapMessage = 'Verzeichnis erfolgreich initialisiert!';
      this.bootstrapMessageSeverity = 'success';
      this.messageService.add({
        severity: 'success',
        summary: 'Initialisiert',
        detail: 'Das Datenverzeichnis wurde erfolgreich initialisiert.'
      });
      
      this.checkCanBootstrap();
    } catch (error) {
      console.error('Failed to bootstrap:', error);
      this.bootstrapMessage = 'Initialisierung fehlgeschlagen: ' + (error as Error).message;
      this.bootstrapMessageSeverity = 'error';
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: 'Initialisierung fehlgeschlagen: ' + (error as Error).message
      });
    } finally {
      this.isBootstrapping = false;
    }
  }

  private updateDirectoryInfo(): void {
    const connection = this.fileConnection.getConnection();
    if (connection.directoryHandle) {
      this.dataDirectoryName = connection.directoryHandle.name;
    } else {
      this.dataDirectoryName = '';
    }
  }

  private updateDatastoreInfo(datastore: Datastore | null): void {
    if (datastore) {
      const date = new Date(datastore.generatedAt);
      this.datastoreInfo = `Revision ${datastore.revisionId} / ${date.toLocaleString('de-DE')}`;
      this.topicsCount = datastore.topics.length;
      this.membersCount = datastore.members.length;
    } else {
      this.datastoreInfo = '';
      this.topicsCount = null;
      this.membersCount = null;
    }
  }

  private async checkCanBootstrap(): Promise<void> {
    // Check if datastore is empty (can bootstrap)
    const datastore = this.backend.getDatastore();
    if (datastore) {
      this.canBootstrap = datastore.topics.length === 0 && datastore.members.length === 0;
    } else {
      this.canBootstrap = true;
    }
  }
}
