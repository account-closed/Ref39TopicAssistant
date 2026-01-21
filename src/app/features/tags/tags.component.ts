import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Dialog } from 'primeng/dialog';
import { AutoComplete } from 'primeng/autocomplete';
import { Textarea } from 'primeng/textarea';
import { Tag as PrimeTag } from 'primeng/tag';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Tooltip } from 'primeng/tooltip';
import { ColorPicker } from 'primeng/colorpicker';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { Tag, TeamMember, Datastore } from '../../core/models';
import { isValidKeyword, sanitizeKeyword } from '../../shared/utils/validation.utils';
import { TAG_WEIGHT_RECOMMENDED_MIN, TAG_WEIGHT_RECOMMENDED_MAX } from '../../core/services/load-calculation.service';

@Component({
  selector: 'app-tags',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    Button,
    InputText,
    Dialog,
    AutoComplete,
    Textarea,
    PrimeTag,
    ConfirmDialog,
    Toast,
    Toolbar,
    IconField,
    InputIcon,
    Tooltip,
    ColorPicker,
    ToggleSwitch,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './tags.component.html',
  styleUrl: './tags.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TagsComponent implements OnInit, OnDestroy {
  @ViewChild('dt') table!: Table;

  tags: (Tag & { searchKeywordsString?: string; createdByName?: string })[] = [];
  tag: Tag = this.createEmptyTag();
  members: TeamMember[] = [];
  
  tagDialog: boolean = false;
  editMode: boolean = false;
  submitted: boolean = false;
  saving: boolean = false;
  isConnected: boolean = false;

  globalFilter: string = '';

  allKeywords: string[] = [];
  keywordSuggestions: string[] = [];

  private usageCountCache: Map<string, number> = new Map();

  private originalTagName: string = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
      })
    );

    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        if (datastore) {
          this.loadData(datastore);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadData(datastore: Datastore): void {
    this.members = datastore.members;
    
    this.usageCountCache.clear();
    datastore.topics.forEach(topic => {
      topic.tags?.forEach(tagName => {
        const current = this.usageCountCache.get(tagName) || 0;
        this.usageCountCache.set(tagName, current + 1);
      });
    });

    this.tags = (datastore.tags || []).map(tag => ({
      ...tag,
      searchKeywordsString: tag.searchKeywords?.join(' ') || '',
      createdByName: this.getMemberName(tag.createdBy)
    }));

    const keywordSet = new Set<string>();
    (datastore.tags || []).forEach(t => t.searchKeywords?.forEach(kw => keywordSet.add(kw)));
    this.allKeywords = Array.from(keywordSet).sort();
  }

  getMemberName(memberId: string): string {
    const member = this.members.find(m => m.id === memberId);
    return member?.displayName || 'Unbekannt';
  }

  getUsageCount(tagName: string): number {
    return this.usageCountCache.get(tagName) || 0;
  }

  searchKeywords(event: { query: string }): void {
    const query = event.query.toLowerCase();
    // Sanitize the query for suggestions
    const sanitized = sanitizeKeyword(query);
    
    this.keywordSuggestions = this.allKeywords.filter(kw => 
      kw.toLowerCase().includes(query)
    );
    // Only suggest the sanitized version if it's valid and not already in suggestions
    if (sanitized && isValidKeyword(sanitized) && !this.keywordSuggestions.includes(sanitized)) {
      this.keywordSuggestions.unshift(sanitized);
    }
  }

  /**
   * Validates and sanitizes a keyword when it's added.
   * Called from the onAdd event of the autocomplete.
   */
  onKeywordAdd(event: { value: string }): void {
    if (!event.value || !this.tag.searchKeywords) return;
    
    const sanitized = sanitizeKeyword(event.value);
    
    if (!isValidKeyword(sanitized)) {
      // Remove the invalid keyword if it was added
      const index = this.tag.searchKeywords.indexOf(event.value);
      if (index > -1) {
        this.tag.searchKeywords.splice(index, 1);
      }
      this.messageService.add({
        severity: 'warn',
        summary: 'Ungültiger Suchbegriff',
        detail: 'Suchbegriffe dürfen keine Leerzeichen oder Sonderzeichen enthalten (erlaubt: _ - .)',
        life: 4000
      });
      return;
    }
    
    // Replace with sanitized version if different
    if (sanitized !== event.value) {
      const index = this.tag.searchKeywords.indexOf(event.value);
      if (index > -1) {
        this.tag.searchKeywords[index] = sanitized;
      }
    }
  }

  /**
   * Checks if the tag name is valid (no spaces or special characters except _, -, .)
   */
  isValidTagName(): boolean {
    if (!this.tag.name?.trim()) {
      return false;
    }
    return isValidKeyword(this.tag.name.trim());
  }

  /**
   * Sanitizes the tag name input in real-time, removing invalid characters.
   * Called on every input event to prevent invalid characters from being entered.
   */
  onTagNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = sanitizeKeyword(input.value);
    if (sanitized !== input.value) {
      this.tag.name = sanitized;
      input.value = sanitized;
    }
  }

  createEmptyTag(): Tag {
    const currentMemberId = localStorage.getItem('currentMemberId') || '';
    return {
      id: '',
      name: '',
      searchKeywords: [],
      hinweise: '',
      copyPasteText: '',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      createdBy: currentMemberId
    };
  }

  openNewDialog(): void {
    this.tag = this.createEmptyTag();
    this.originalTagName = '';
    this.submitted = false;
    this.editMode = false;
    this.tagDialog = true;
  }

  editTag(tag: Tag): void {
    this.tag = { 
      ...tag,
      searchKeywords: [...(tag.searchKeywords || [])]
    };
    this.originalTagName = tag.name;
    this.submitted = false;
    this.editMode = true;
    this.tagDialog = true;
  }

  hideDialog(): void {
    this.tagDialog = false;
    this.submitted = false;
  }

  isDuplicateName(): boolean {
    const normalizedName = this.tag.name.trim().toLowerCase();
    if (this.editMode && normalizedName === this.originalTagName.toLowerCase()) {
      return false;
    }
    return this.tags.some(t => t.name.toLowerCase() === normalizedName);
  }

  async saveTag(): Promise<void> {
    this.submitted = true;

    if (!this.tag.name?.trim()) {
      return;
    }

    if (!this.isValidTagName()) {
      return;
    }

    if (this.isDuplicateName()) {
      return;
    }

    this.saving = true;

    try {
      let success: boolean;
      if (this.editMode) {
        success = await this.backend.updateTag(this.tag.id, this.tag);
      } else {
        this.tag.id = this.backend.generateUUID();
        this.tag.createdAt = new Date().toISOString();
        this.tag.modifiedAt = new Date().toISOString();
        success = await this.backend.addTag(this.tag);
      }

      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: this.editMode ? 'Tag aktualisiert' : 'Tag erstellt'
        });
        this.tagDialog = false;
        this.tag = this.createEmptyTag();
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Fehler',
          detail: 'Speichern fehlgeschlagen. Möglicherweise ist die Datei gesperrt.'
        });
      }
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: 'Unerwarteter Fehler beim Speichern: ' + (error as Error).message
      });
    } finally {
      this.saving = false;
    }
  }

  confirmDelete(tag: Tag): void {
    const usageCount = this.getUsageCount(tag.name);
    const message = usageCount > 0
      ? `Der Tag "${tag.name}" wird in ${usageCount} Themen verwendet. Beim Löschen wird er aus allen Themen entfernt. Fortfahren?`
      : `Möchten Sie den Tag "${tag.name}" wirklich löschen?`;

    this.confirmationService.confirm({
      message,
      header: 'Löschen bestätigen',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Ja, löschen',
      rejectLabel: 'Abbrechen',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteTag(tag)
    });
  }

  async deleteTag(tag: Tag): Promise<void> {
    try {
      const success = await this.backend.deleteTag(tag.id);
      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: 'Tag gelöscht'
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Fehler',
          detail: 'Löschen fehlgeschlagen. Möglicherweise ist die Datei gesperrt.'
        });
      }
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: 'Unerwarteter Fehler beim Löschen: ' + (error as Error).message
      });
    }
  }

  onGlobalFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.table?.filterGlobal(value, 'contains');
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'Kopiert',
        detail: 'Text wurde in die Zwischenablage kopiert',
        life: 2000
      });
    }).catch(() => {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: 'Text konnte nicht kopiert werden'
      });
    });
  }

  formatDate(isoString: string): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Checks if the tag's tagWeight is outside the recommended range.
   */
  isExtremeTagWeight(): boolean {
    const weight = this.tag.tagWeight;
    if (weight === null || weight === undefined) return false;
    return weight < TAG_WEIGHT_RECOMMENDED_MIN || weight > TAG_WEIGHT_RECOMMENDED_MAX;
  }
}
