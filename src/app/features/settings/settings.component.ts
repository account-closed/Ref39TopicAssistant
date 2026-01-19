import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { CacheService, CacheState } from '../../core/services/cache.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { Datastore } from '../../core/models';
import { PageWrapperComponent } from '../../shared/components';

type BackendType = 'filesystem' | 'rest';

interface BackendOption {
  label: string;
  value: BackendType;
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule, Card, Button, SelectButton, Divider, Tag, Message, ConfirmDialog, PageWrapperComponent],
  providers: [ConfirmationService],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit, OnDestroy {
  private backend = inject(BackendService);
  private fileConnection = inject(FileConnectionService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private cache = inject(CacheService);
  private persistence = inject(PersistenceService);

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

  // Cache state signals
  private readonly cacheState = toSignal(this.cache.cacheState$, {
    initialValue: { datastore: null, isDirty: false, lastSyncTime: null, revisionId: 0 } as CacheState
  });
  
  readonly isSaving = this.persistence.isSaving;
  readonly lastSaveTime = this.persistence.lastSaveTime;
  readonly pendingChangesCount = this.cache.pendingChangesCount;
  readonly hasUnsavedChanges = computed(() => this.cacheState().isDirty);
  
  // For backwards compatibility with template
  readonly queuedOperations = signal<Array<{ id: string; type: string; timestamp: string; description: string }>>([]);

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
   * Save all changes to backend.
   */
  async saveNow(): Promise<void> {
    const result = await this.persistence.saveToBackend();
    
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
   * Discard all unsaved changes by reloading from backend.
   */
  clearQueue(): void {
    if (!this.hasUnsavedChanges()) {
      return;
    }
    
    this.confirmationService.confirm({
      message: 'Möchten Sie wirklich alle ausstehenden Änderungen verwerfen?',
      header: 'Änderungen verwerfen',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Ja, verwerfen',
      rejectLabel: 'Abbrechen',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        const result = await this.persistence.forceReload();
        if (result.success) {
          this.messageService.add({
            severity: 'info',
            summary: 'Änderungen verworfen',
            detail: 'Alle ausstehenden Änderungen wurden verworfen.'
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Fehler',
            detail: result.germanMessage
          });
        }
      }
    });
  }
}
