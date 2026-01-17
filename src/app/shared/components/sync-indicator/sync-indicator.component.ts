import { Component, OnInit, inject, DestroyRef, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Tooltip } from 'primeng/tooltip';
import { BackendService } from '../../../core/services/backend.service';
import { FileConnectionService } from '../../../core/services/file-connection.service';
import { Datastore } from '../../../core/models';

@Component({
  selector: 'app-sync-indicator',
  imports: [Tooltip],
  templateUrl: './sync-indicator.component.html',
  styleUrl: './sync-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncIndicatorComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly backend = inject(BackendService);
  private readonly fileConnection = inject(FileConnectionService);

  protected readonly isConnected = signal(false);
  protected readonly folderPath = signal('');
  protected readonly revisionId = signal<number | null>(null);
  protected readonly generatedAt = signal('');

  protected readonly tooltipText = computed(() => {
    if (!this.isConnected()) {
      return 'Nicht verbunden';
    }

    const parts: string[] = [];
    const folder = this.folderPath();
    const version = this.revisionId();
    const timestamp = this.generatedAt();

    if (folder) {
      parts.push(`Pfad: ${folder}`);
    }
    if (version !== null) {
      parts.push(`Version: ${version}`);
    }
    if (timestamp) {
      parts.push(`Stand: ${timestamp}`);
    }
    return parts.length > 0 ? parts.join('\n') : 'Verbunden';
  });

  protected readonly statusClass = computed(() => 
    this.isConnected() ? 'connected' : 'disconnected'
  );

  ngOnInit(): void {
    // Subscribe to connection status
    this.backend.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(connected => this.isConnected.set(connected));

    // Subscribe to file connection to get folder path
    this.fileConnection.connection$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(connection => {
        if (connection.directoryHandle) {
          this.folderPath.set(connection.directoryHandle.name);
        } else {
          this.folderPath.set('');
        }
      });

    // Subscribe to datastore to get version info
    this.backend.datastore$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((datastore: Datastore | null) => {
        if (datastore) {
          this.revisionId.set(datastore.revisionId);
          const date = new Date(datastore.generatedAt);
          this.generatedAt.set(date.toLocaleString('de-DE'));
        } else {
          this.revisionId.set(null);
          this.generatedAt.set('');
        }
      });
  }
}
