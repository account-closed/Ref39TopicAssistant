import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { CacheService } from '../../../core/services/cache.service';
import { PersistenceService } from '../../../core/services/persistence.service';

@Component({
  selector: 'app-save-button',
  imports: [Button, Tooltip],
  templateUrl: './save-button.component.html',
  styleUrl: './save-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SaveButtonComponent {
  private cache = inject(CacheService);
  private persistence = inject(PersistenceService);
  private messageService = inject(MessageService);

  // State from services
  protected readonly isSaving = this.persistence.isSaving;
  protected readonly pendingCount = this.cache.pendingChangesCount;
  protected readonly lastSaveTime = this.persistence.lastSaveTime;
  
  // Convert cache state to signal
  private readonly cacheState = toSignal(this.cache.cacheState$, { 
    initialValue: { datastore: null, isDirty: false, lastSyncTime: null, revisionId: 0 } 
  });
  
  protected readonly hasChanges = computed(() => this.cacheState().isDirty);
  
  // Computed state
  protected readonly isDisabled = computed(() => 
    this.isSaving() || !this.hasChanges()
  );

  protected readonly buttonLabel = computed(() => {
    if (this.isSaving()) {
      return 'Speichern...';
    }
    return 'Speichern';
  });

  protected readonly tooltipText = computed(() => {
    const parts: string[] = [];
    
    const count = this.pendingCount();
    if (count > 0) {
      parts.push(`${count} ausstehende ${count === 1 ? 'Änderung' : 'Änderungen'}`);
    } else if (this.hasChanges()) {
      parts.push('Änderungen ausstehend');
    } else {
      parts.push('Keine ausstehenden Änderungen');
    }

    const lastSave = this.lastSaveTime();
    if (lastSave) {
      const timeSince = this.getTimeSinceLastSave(lastSave);
      parts.push(`Zuletzt gespeichert: ${timeSince}`);
    }

    return parts.join('\n');
  });

  protected readonly ariaLabel = computed(() => 
    `Änderungen speichern - ${this.pendingCount()} ausstehend`
  );

  /**
   * Calculate human-readable time since last save
   */
  private getTimeSinceLastSave(lastSaveIso: string): string {
    const now = new Date();
    const lastSave = new Date(lastSaveIso);
    const diffMs = now.getTime() - lastSave.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'gerade eben';
    } else if (diffMinutes === 1) {
      return 'vor 1 Minute';
    } else if (diffMinutes < 60) {
      return `vor ${diffMinutes} Minuten`;
    } else if (diffHours === 1) {
      return 'vor 1 Stunde';
    } else if (diffHours < 24) {
      return `vor ${diffHours} Stunden`;
    } else if (diffDays === 1) {
      return 'vor 1 Tag';
    } else {
      return `vor ${diffDays} Tagen`;
    }
  }

  /**
   * Handle save button click
   */
  protected async onSaveClick(): Promise<void> {
    const result = await this.persistence.saveToBackend();
    
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Erfolgreich gespeichert',
        detail: result.germanMessage,
        life: 3000
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler beim Speichern',
        detail: result.germanMessage,
        life: 5000
      });
    }
  }
}
