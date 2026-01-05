import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tooltip } from 'primeng/tooltip';
import { Subscription } from 'rxjs';
import { BackendService } from '../../../core/services/backend.service';
import { FileConnectionService } from '../../../core/services/file-connection.service';
import { Datastore } from '../../../core/models';

@Component({
  selector: 'app-sync-indicator',
  standalone: true,
  imports: [CommonModule, Tooltip],
  templateUrl: './sync-indicator.component.html',
  styleUrl: './sync-indicator.component.scss'
})
export class SyncIndicatorComponent implements OnInit, OnDestroy {
  isConnected = false;
  folderPath = '';
  revisionId: number | null = null;
  generatedAt = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private fileConnection: FileConnectionService
  ) {}

  ngOnInit(): void {
    // Subscribe to connection status
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
      })
    );

    // Subscribe to file connection to get folder path
    this.subscriptions.push(
      this.fileConnection.connection$.subscribe(connection => {
        if (connection.directoryHandle) {
          this.folderPath = connection.directoryHandle.name;
        } else {
          this.folderPath = '';
        }
      })
    );

    // Subscribe to datastore to get version info
    this.subscriptions.push(
      this.backend.datastore$.subscribe((datastore: Datastore | null) => {
        if (datastore) {
          this.revisionId = datastore.revisionId;
          const date = new Date(datastore.generatedAt);
          this.generatedAt = date.toLocaleString('de-DE');
        } else {
          this.revisionId = null;
          this.generatedAt = '';
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  getTooltipText(): string {
    if (!this.isConnected) {
      return 'Nicht verbunden';
    }

    let text = '';
    if (this.folderPath) {
      text += `Pfad: ${this.folderPath}`;
    }
    if (this.revisionId !== null) {
      if (text) text += '\n';
      text += `Version: ${this.revisionId}`;
    }
    if (this.generatedAt) {
      if (text) text += '\n';
      text += `Stand: ${this.generatedAt}`;
    }
    return text || 'Verbunden';
  }

  getStatusClass(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }
}
