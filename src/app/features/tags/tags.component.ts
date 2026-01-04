import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
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
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { Tag, TeamMember, Datastore } from '../../core/models';

@Component({
  selector: 'app-tags',
  standalone: true,
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
    Tooltip
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="page-container">
      <p-toast></p-toast>
      <p-confirmDialog></p-confirmDialog>

      <div class="page-header">
        <h1>Tags verwalten</h1>
        <p>Erstellen, bearbeiten und löschen Sie Tags für die Themenzuordnung</p>
      </div>

      <p-toolbar styleClass="mb-4">
        <ng-template #start>
          <p-button 
            label="Neuer Tag" 
            icon="pi pi-plus" 
            severity="primary" 
            (onClick)="openNewDialog()"
            [disabled]="!isConnected">
          </p-button>
        </ng-template>
        <ng-template #end>
          <p-iconfield>
            <p-inputicon styleClass="pi pi-search" />
            <input 
              pInputText 
              type="text" 
              [(ngModel)]="globalFilter" 
              (input)="onGlobalFilter($event)" 
              placeholder="Suche..." />
          </p-iconfield>
        </ng-template>
      </p-toolbar>

      <div class="card" *ngIf="!isConnected">
        <p class="text-center text-secondary">
          <i class="pi pi-info-circle"></i>
          Bitte verbinden Sie zuerst ein Datenverzeichnis über die Einstellungen.
        </p>
      </div>

      <p-table 
        #dt
        *ngIf="isConnected"
        [value]="tags" 
        [paginator]="true" 
        [rows]="10"
        [rowsPerPageOptions]="[10, 25, 50]"
        [globalFilterFields]="['name', 'hinweise', 'searchKeywordsString', 'createdByName']"
        [sortField]="'name'"
        [sortOrder]="1"
        styleClass="p-datatable-striped"
        [tableStyle]="{'min-width': '60rem'}">
        
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="name" style="min-width:12rem">
              Tag <p-sortIcon field="name"></p-sortIcon>
            </th>
            <th style="min-width:12rem">Suchbegriffe</th>
            <th style="min-width:14rem">Hinweise</th>
            <th style="min-width:8rem">Copy-Paste</th>
            <th style="min-width:6rem">Verwendung</th>
            <th pSortableColumn="createdByName" style="min-width:10rem">
              Erstellt von <p-sortIcon field="createdByName"></p-sortIcon>
            </th>
            <th pSortableColumn="modifiedAt" style="min-width:10rem">
              Aktualisiert <p-sortIcon field="modifiedAt"></p-sortIcon>
            </th>
            <th style="min-width:8rem">Aktionen</th>
          </tr>
          <tr>
            <th>
              <input 
                pInputText 
                type="text" 
                (input)="dt.filter($any($event.target).value, 'name', 'contains')"
                placeholder="Filter..." 
                class="w-full" />
            </th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </ng-template>
        
        <ng-template pTemplate="body" let-tag>
          <tr>
            <td>
              <p-tag [value]="tag.name" severity="info"></p-tag>
            </td>
            <td>
              <span *ngFor="let kw of tag.searchKeywords; let last = last">
                {{ kw }}{{ !last ? ', ' : '' }}
              </span>
              <span *ngIf="!tag.searchKeywords || tag.searchKeywords.length === 0" class="text-secondary">-</span>
            </td>
            <td>
              <span *ngIf="tag.hinweise" class="hinweise-cell" [pTooltip]="tag.hinweise" tooltipPosition="top">
                {{ tag.hinweise | slice:0:50 }}{{ (tag.hinweise?.length || 0) > 50 ? '...' : '' }}
              </span>
              <span *ngIf="!tag.hinweise" class="text-secondary">-</span>
            </td>
            <td>
              <p-button 
                *ngIf="tag.copyPasteText"
                icon="pi pi-copy" 
                [rounded]="true" 
                [text]="true" 
                severity="secondary" 
                (onClick)="copyToClipboard(tag.copyPasteText)"
                [pTooltip]="tag.copyPasteText"
                tooltipPosition="top">
              </p-button>
              <span *ngIf="!tag.copyPasteText" class="text-secondary">-</span>
            </td>
            <td>
              <p-tag [value]="getUsageCount(tag.name).toString()" [severity]="getUsageCount(tag.name) > 0 ? 'success' : 'secondary'"></p-tag>
            </td>
            <td>{{ tag.createdByName || 'Unbekannt' }}</td>
            <td>{{ formatDate(tag.modifiedAt) }}</td>
            <td>
              <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" (onClick)="editTag(tag)"></p-button>
              <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="confirmDelete(tag)"></p-button>
            </td>
          </tr>
        </ng-template>

        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="8" class="text-center">
              <i class="pi pi-tags" style="font-size: 2rem; color: #ccc;"></i>
              <p>Keine Tags gefunden</p>
            </td>
          </tr>
        </ng-template>
      </p-table>

      <!-- Create/Edit Dialog -->
      <p-dialog 
        [(visible)]="tagDialog" 
        [style]="{width: '600px'}" 
        [header]="editMode ? 'Tag bearbeiten' : 'Neuer Tag'" 
        [modal]="true"
        [closable]="true"
        styleClass="p-fluid">
        
        <ng-template pTemplate="content">
          <div class="form-grid">
            <!-- Name (required) -->
            <div class="field">
              <label for="name">Tag Name *</label>
              <input 
                pInputText 
                id="name" 
                [(ngModel)]="tag.name" 
                required 
                autofocus
                [class.ng-invalid]="submitted && !tag.name"
                [class.ng-dirty]="submitted && !tag.name" />
              <small class="p-error" *ngIf="submitted && !tag.name">Tag Name ist erforderlich.</small>
              <small class="p-error" *ngIf="submitted && tag.name && isDuplicateName()">Ein Tag mit diesem Namen existiert bereits.</small>
            </div>

            <!-- Search Keywords -->
            <div class="field">
              <label for="searchKeywords">Suchbegriffe</label>
              <p-autoComplete 
                id="searchKeywords" 
                [(ngModel)]="tag.searchKeywords"
                [multiple]="true"
                [suggestions]="keywordSuggestions"
                (completeMethod)="searchKeywords($event)"
                placeholder="Suchbegriffe hinzufügen...">
              </p-autoComplete>
              <small class="hint">Zusätzliche Begriffe für die Suche nach diesem Tag</small>
            </div>

            <!-- Hinweise -->
            <div class="field">
              <label for="hinweise">Hinweise</label>
              <textarea 
                pTextarea 
                id="hinweise" 
                [(ngModel)]="tag.hinweise" 
                rows="3"
                [autoResize]="true"
                placeholder="Hinweise zur Verwendung dieses Tags...">
              </textarea>
              <small class="hint">Hinweise und Tipps zur korrekten Verwendung dieses Tags</small>
            </div>

            <!-- Copy-Paste Text -->
            <div class="field">
              <label for="copyPasteText">Copy-Paste Text</label>
              <textarea 
                pTextarea 
                id="copyPasteText" 
                [(ngModel)]="tag.copyPasteText" 
                rows="3"
                [autoResize]="true"
                placeholder="Text zum Kopieren...">
              </textarea>
              <small class="hint">Vorlagen-Text zum schnellen Kopieren in die Zwischenablage</small>
            </div>
          </div>
        </ng-template>

        <ng-template pTemplate="footer">
          <p-button label="Abbrechen" icon="pi pi-times" [text]="true" (onClick)="hideDialog()"></p-button>
          <p-button label="Speichern" icon="pi pi-check" (onClick)="saveTag()" [loading]="saving"></p-button>
        </ng-template>
      </p-dialog>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 1.5rem;
    }

    .page-header h1 {
      margin: 0 0 0.5rem 0;
      color: var(--text-color);
    }

    .page-header p {
      margin: 0;
      color: var(--text-color-secondary);
    }

    .mb-4 {
      margin-bottom: 1.5rem;
    }

    .card {
      background: var(--surface-card);
      padding: 2rem;
      border-radius: var(--border-radius);
      box-shadow: var(--card-shadow);
    }

    .text-center {
      text-align: center;
    }

    .text-secondary {
      color: var(--text-color-secondary);
    }

    .w-full {
      width: 100%;
    }

    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .field label {
      font-weight: 600;
      color: var(--text-color);
    }

    .hint {
      color: var(--text-color-secondary);
      font-size: 0.875rem;
    }

    .hinweise-cell {
      cursor: help;
    }

    :host ::ng-deep .p-datatable .p-datatable-header {
      padding: 1rem;
      background: var(--surface-ground);
    }

    :host ::ng-deep .p-datatable .p-datatable-thead > tr > th {
      background: var(--surface-ground);
    }

    :host ::ng-deep .p-toolbar {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: var(--border-radius);
    }
  `]
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

  // Filter values
  globalFilter: string = '';

  // Keyword suggestions
  allKeywords: string[] = [];
  keywordSuggestions: string[] = [];

  // Usage count cache
  private usageCountCache: Map<string, number> = new Map();

  // Original tag name for edit mode (to check for duplicates)
  private originalTagName: string = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    // Subscribe to connection status
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
      })
    );

    // Subscribe to datastore
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
    
    // Build usage count cache
    this.usageCountCache.clear();
    datastore.topics.forEach(topic => {
      topic.tags?.forEach(tagName => {
        const current = this.usageCountCache.get(tagName) || 0;
        this.usageCountCache.set(tagName, current + 1);
      });
    });

    // Process tags with additional fields for filtering/display
    this.tags = (datastore.tags || []).map(tag => ({
      ...tag,
      searchKeywordsString: tag.searchKeywords?.join(' ') || '',
      createdByName: this.getMemberName(tag.createdBy)
    }));

    // Collect all unique keywords for autocomplete
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
    this.keywordSuggestions = this.allKeywords.filter(kw => 
      kw.toLowerCase().includes(query)
    );
    // Allow adding new keywords
    if (query && !this.keywordSuggestions.includes(query)) {
      this.keywordSuggestions.unshift(query);
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
    // In edit mode, allow keeping the same name
    if (this.editMode && normalizedName === this.originalTagName.toLowerCase()) {
      return false;
    }
    return this.tags.some(t => t.name.toLowerCase() === normalizedName);
  }

  async saveTag(): Promise<void> {
    this.submitted = true;

    // Validate required fields
    if (!this.tag.name?.trim()) {
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
}
