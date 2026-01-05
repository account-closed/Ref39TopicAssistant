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
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit, OnDestroy {
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

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private fileConnection: FileConnectionService,
    private messageService: MessageService
  ) {}

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
}
