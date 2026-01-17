import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { Divider } from 'primeng/divider';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { FileConnectionService } from '../../core/services/file-connection.service';
import { WriteQueueService } from '../../core/services/write-queue.service';
import { Datastore } from '../../core/models';

type BackendType = 'filesystem' | 'rest';

interface BackendOption {
  label: string;
  value: BackendType;
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule, Card, Button, SelectButton, Divider, Tag, Message, ConfirmDialog],
  providers: [ConfirmationService],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit, OnDestroy {
  private backend = inject(BackendService);
  private fileConnection = inject(FileConnectionService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private writeQueueService = inject(WriteQueueService);

  isConnected = false;
  isConnecting = false;
  dataDirectoryName = '';
  datastoreInfo = '';
  topicsCount: number | null = null;
  membersCount: number | null = null;

  isBootstrapping = false;
  canBootstrap = false;
  bootstrapMessage = '';
  bootstrapMessageSeverity: 'success' | 'info' | 'warn' | 'error' = 'info';

  backendTypeDisplay = 'Dateisystem';
  selectedBackendType: BackendType = 'filesystem';
  backendOptions: BackendOption[] = [
    { label: 'Dateisystem', value: 'filesystem' },
    { label: 'REST API', value: 'rest' }
  ];

  browserInfo = '';
  hasFileSystemAPI = false;

  // Queue-related properties
  queuedOperations = this.writeQueueService.queuedOperations;
  isSaving = this.writeQueueService.isSaving;
  lastSaveTime = this.writeQueueService.lastSaveTime;
  pendingChangesCount = this.writeQueueService.pendingChangesCount;

  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.hasFileSystemAPI = 'showDirectoryPicker' in window;
    this.browserInfo = navigator.userAgent.split(' ').slice(-2).join(' ');

    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
        this.updateDirectoryInfo();
      })
    );

    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        this.updateDatastoreInfo(datastore);
      })
    );

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
      const emptyDatastore: Datastore = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        revisionId: 0,
        members: [],
        topics: []
      };

      await this.fileConnection.writeDatastore(JSON.stringify(emptyDatastore, null, 2));

      const staleLock = {
        lockedAt: '1970-01-01T00:00:00Z',
        ttlSeconds: 120,
        lockedBy: { memberId: '', displayName: '' },
        clientId: '',
        purpose: 'topic-save'
      };
      await this.fileConnection.writeLock(JSON.stringify(staleLock, null, 2));

      const refreshSignal = {
        revisionId: 0,
        ts: new Date().toISOString(),
        by: { memberId: '', displayName: 'System' }
      };
      await this.fileConnection.writeRefresh(JSON.stringify(refreshSignal, null, 2));

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
    const datastore = this.backend.getDatastore();
    if (datastore) {
      this.canBootstrap = datastore.topics.length === 0 && datastore.members.length === 0;
    } else {
      this.canBootstrap = true;
    }
  }

  /**
   * Get operation type info for display (icon and severity).
   */
  getOperationTypeInfo(type: string): { icon: string; severity: 'success' | 'info' | 'danger' } {
    if (type.startsWith('add-')) {
      return { icon: 'pi-plus', severity: 'success' };
    } else if (type.startsWith('update-')) {
      return { icon: 'pi-pencil', severity: 'info' };
    } else if (type.startsWith('delete-')) {
      return { icon: 'pi-trash', severity: 'danger' };
    }
    return { icon: 'pi-question', severity: 'info' };
  }

  /**
   * Get a human-readable label for operation type.
   */
  getOperationTypeLabel(type: string): string {
    if (type.startsWith('add-')) {
      return 'Hinzufügen';
    } else if (type.startsWith('update-')) {
      return 'Aktualisieren';
    } else if (type.startsWith('delete-')) {
      return 'Löschen';
    }
    return type;
  }

  /**
   * Format timestamp for display.
   */
  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Format last save time for display.
   */
  formatLastSaveTime(timestamp: string | null): string {
    if (!timestamp) {
      return 'Nie';
    }
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Save all queued operations immediately.
   */
  async saveNow(): Promise<void> {
    const result = await this.writeQueueService.saveNow();
    
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Erfolgreich gespeichert',
        detail: result.germanMessage
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler beim Speichern',
        detail: result.germanMessage
      });
    }
  }

  /**
   * Clear the queue with confirmation.
   */
  clearQueue(): void {
    this.confirmationService.confirm({
      message: `Möchten Sie wirklich alle ${this.pendingChangesCount()} ausstehenden Änderungen verwerfen?`,
      header: 'Warteschlange leeren',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Ja, verwerfen',
      rejectLabel: 'Abbrechen',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.writeQueueService.clearQueue();
        this.messageService.add({
          severity: 'info',
          summary: 'Warteschlange geleert',
          detail: 'Alle ausstehenden Änderungen wurden verworfen.'
        });
      }
    });
  }
}
