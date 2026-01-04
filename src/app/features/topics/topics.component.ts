import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Dialog } from 'primeng/dialog';
import { AutoComplete } from 'primeng/autocomplete';
import { Textarea } from 'primeng/textarea';
import { Select } from 'primeng/select';
import { MultiSelect } from 'primeng/multiselect';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { DatePicker } from 'primeng/datepicker';
import { Tag } from 'primeng/tag';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { Topic, TeamMember, TopicValidity, TopicRaci, Datastore, Tag as TagModel } from '../../core/models';

interface MemberOption {
  id: string;
  displayName: string;
}

@Component({
  selector: 'app-topics',
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
    Select,
    MultiSelect,
    ToggleSwitch,
    DatePicker,
    Tag,
    ConfirmDialog,
    Toast,
    Toolbar,
    IconField,
    InputIcon
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="page-container">
      <p-toast></p-toast>
      <p-confirmDialog></p-confirmDialog>

      <div class="page-header">
        <h1>Themen verwalten</h1>
        <p>Erstellen, bearbeiten und löschen Sie Themen für die RACI-Zuordnung</p>
      </div>

      <p-toolbar styleClass="mb-4">
        <ng-template #start>
          <p-button 
            label="Neues Thema" 
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
        [value]="topics" 
        [paginator]="true" 
        [rows]="10"
        [rowsPerPageOptions]="[10, 25, 50]"
        [globalFilterFields]="['header', 'description', 'tagsString', 'r1Name']"
        [sortField]="'updatedAt'"
        [sortOrder]="-1"
        styleClass="p-datatable-striped"
        [tableStyle]="{'min-width': '60rem'}">
        
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="header" style="min-width:14rem">
              Thema <p-sortIcon field="header"></p-sortIcon>
            </th>
            <th pSortableColumn="r1Name" style="min-width:10rem">
              R1 <p-sortIcon field="r1Name"></p-sortIcon>
            </th>
            <th style="min-width:10rem">Tags</th>
            <th style="min-width:8rem">Gültigkeit</th>
            <th pSortableColumn="updatedAt" style="min-width:10rem">
              Aktualisiert <p-sortIcon field="updatedAt"></p-sortIcon>
            </th>
            <th style="min-width:8rem">Aktionen</th>
          </tr>
          <tr>
            <th>
              <input 
                pInputText 
                type="text" 
                [(ngModel)]="filterHeader"
                (input)="dt.filter($any($event.target).value, 'header', 'contains')"
                placeholder="Filter..." 
                class="w-full" />
            </th>
            <th>
              <p-select 
                [options]="memberOptions" 
                [(ngModel)]="filterR1"
                (onChange)="dt.filter($event.value, 'r1MemberId', 'equals')"
                optionLabel="displayName" 
                optionValue="id"
                placeholder="Alle"
                [showClear]="true"
                styleClass="w-full">
              </p-select>
            </th>
            <th>
              <p-multiSelect 
                [options]="allTags" 
                [(ngModel)]="filterTags"
                (onChange)="filterByTags()"
                placeholder="Filter Tags"
                styleClass="w-full">
              </p-multiSelect>
            </th>
            <th>
              <p-select 
                [options]="validityOptions" 
                [(ngModel)]="filterValidity"
                (onChange)="filterByValidity()"
                placeholder="Alle"
                [showClear]="true"
                styleClass="w-full">
              </p-select>
            </th>
            <th></th>
            <th></th>
          </tr>
        </ng-template>
        
        <ng-template pTemplate="body" let-topic>
          <tr>
            <td>
              <strong>{{ topic.header }}</strong>
              <div class="text-secondary text-sm" *ngIf="topic.description">
                {{ topic.description | slice:0:100 }}{{ topic.description.length > 100 ? '...' : '' }}
              </div>
            </td>
            <td>{{ getMemberName(topic.raci.r1MemberId) }}</td>
            <td>
              <p-tag *ngFor="let tag of topic.tags" [value]="tag" severity="info" styleClass="mr-1 mb-1"></p-tag>
            </td>
            <td>
              <p-tag [value]="getValidityBadge(topic)" [severity]="getValiditySeverity(topic)"></p-tag>
            </td>
            <td>{{ formatDate(topic.updatedAt) }}</td>
            <td>
              <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" (onClick)="editTopic(topic)"></p-button>
              <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="confirmDelete(topic)"></p-button>
            </td>
          </tr>
        </ng-template>

        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="6" class="text-center">
              <i class="pi pi-inbox" style="font-size: 2rem; color: var(--text-color-muted);"></i>
              <p>Keine Themen gefunden</p>
            </td>
          </tr>
        </ng-template>
      </p-table>

      <!-- Create/Edit Dialog -->
      <p-dialog 
        [(visible)]="topicDialog" 
        [style]="{width: '700px'}" 
        [header]="editMode ? 'Thema bearbeiten' : 'Neues Thema'" 
        [modal]="true"
        [closable]="true"
        styleClass="p-fluid">
        
        <ng-template pTemplate="content">
          <div class="form-grid">
            <!-- Header (required) -->
            <div class="field">
              <label for="header">Thema *</label>
              <input 
                pInputText 
                id="header" 
                [(ngModel)]="topic.header" 
                required 
                autofocus
                [class.ng-invalid]="submitted && !topic.header"
                [class.ng-dirty]="submitted && !topic.header" />
              <small class="p-error" *ngIf="submitted && !topic.header">Thema ist erforderlich.</small>
            </div>

            <!-- Description -->
            <div class="field">
              <label for="description">Beschreibung</label>
              <textarea 
                pTextarea 
                id="description" 
                [(ngModel)]="topic.description" 
                rows="3"
                [autoResize]="true">
              </textarea>
            </div>

            <!-- Tags -->
            <div class="field">
              <label for="tags">Tags</label>
              <p-autoComplete 
                id="tags" 
                [(ngModel)]="topic.tags"
                [multiple]="true"
                [suggestions]="tagSuggestions"
                (completeMethod)="searchTags($event)"
                [dropdown]="true"
                [forceSelection]="managedTagsExist"
                placeholder="Tags auswählen...">
                <ng-template let-tag pTemplate="item">
                  <div class="tag-suggestion-item">
                    <span class="tag-name">{{ tag }}</span>
                    <span class="tag-hinweise" *ngIf="getTagHinweise(tag)">{{ getTagHinweise(tag) }}</span>
                  </div>
                </ng-template>
              </p-autoComplete>
              <small class="hint" *ngIf="managedTagsExist">Nur verwaltete Tags können zugewiesen werden</small>
              <small class="hint" *ngIf="!managedTagsExist">Erstellen Sie Tags unter "Tags verwalten"</small>
            </div>

            <!-- Search Keywords -->
            <div class="field">
              <label for="searchKeywords">Suchbegriffe</label>
              <p-autoComplete 
                id="searchKeywords" 
                [(ngModel)]="topic.searchKeywords"
                [multiple]="true"
                [suggestions]="keywordSuggestions"
                (completeMethod)="searchKeywords($event)"
                placeholder="Suchbegriffe hinzufügen...">
              </p-autoComplete>
            </div>

            <!-- Notes -->
            <div class="field">
              <label for="notes">Notizen</label>
              <textarea 
                pTextarea 
                id="notes" 
                [(ngModel)]="topic.notes" 
                rows="2"
                [autoResize]="true">
              </textarea>
            </div>

            <!-- Validity Section -->
            <div class="field-group">
              <h4>Gültigkeit</h4>
              
              <div class="field-checkbox">
                <p-toggleswitch 
                  [(ngModel)]="topic.validity.alwaysValid" 
                  inputId="alwaysValid"
                  (onChange)="onAlwaysValidChange()">
                </p-toggleswitch>
                <label for="alwaysValid" class="ml-2">Immer gültig</label>
              </div>

              <div class="validity-dates" *ngIf="!topic.validity.alwaysValid">
                <div class="field">
                  <label for="validFrom">Gültig ab *</label>
                  <p-datepicker 
                    id="validFrom" 
                    [(ngModel)]="validFromDate"
                    dateFormat="dd.mm.yy"
                    [showIcon]="true"
                    [required]="!topic.validity.alwaysValid"
                    [class.ng-invalid]="submitted && !topic.validity.alwaysValid && !validFromDate"
                    [class.ng-dirty]="submitted && !topic.validity.alwaysValid && !validFromDate">
                  </p-datepicker>
                  <small class="p-error" *ngIf="submitted && !topic.validity.alwaysValid && !validFromDate">
                    Gültig ab ist erforderlich.
                  </small>
                </div>

                <div class="field">
                  <label for="validTo">Gültig bis (optional)</label>
                  <p-datepicker 
                    id="validTo" 
                    [(ngModel)]="validToDate"
                    dateFormat="dd.mm.yy"
                    [showIcon]="true">
                  </p-datepicker>
                </div>
              </div>
            </div>

            <!-- RACI Section -->
            <div class="field-group">
              <h4>Verantwortliche</h4>

              <div class="field">
                <label for="r1">R1 (Hauptverantwortlich) *</label>
                <p-select 
                  id="r1"
                  [options]="activeMembers" 
                  [(ngModel)]="topic.raci.r1MemberId"
                  optionLabel="displayName" 
                  optionValue="id"
                  placeholder="R1 auswählen..."
                  [filter]="true"
                  filterBy="displayName"
                  [required]="true"
                  [class.ng-invalid]="submitted && !topic.raci.r1MemberId"
                  [class.ng-dirty]="submitted && !topic.raci.r1MemberId">
                </p-select>
                <small class="p-error" *ngIf="submitted && !topic.raci.r1MemberId">R1 ist erforderlich.</small>
              </div>

              <div class="field">
                <label for="r2">R2 (Stellvertretung)</label>
                <p-select 
                  id="r2"
                  [options]="activeMembers" 
                  [(ngModel)]="topic.raci.r2MemberId"
                  optionLabel="displayName" 
                  optionValue="id"
                  placeholder="R2 auswählen..."
                  [filter]="true"
                  filterBy="displayName"
                  [showClear]="true">
                </p-select>
              </div>

              <div class="field">
                <label for="r3">R3 (Weitere Stellvertretung)</label>
                <p-select 
                  id="r3"
                  [options]="activeMembers" 
                  [(ngModel)]="topic.raci.r3MemberId"
                  optionLabel="displayName" 
                  optionValue="id"
                  placeholder="R3 auswählen..."
                  [filter]="true"
                  filterBy="displayName"
                  [showClear]="true">
                </p-select>
              </div>

              <div class="field">
                <label for="consulted">Consulted (C)</label>
                <p-multiSelect 
                  id="consulted"
                  [options]="activeMembers" 
                  [(ngModel)]="topic.raci.cMemberIds"
                  optionLabel="displayName" 
                  optionValue="id"
                  placeholder="Consulted auswählen..."
                  [filter]="true"
                  filterBy="displayName">
                </p-multiSelect>
              </div>

              <div class="field">
                <label for="informed">Informed (I)</label>
                <p-multiSelect 
                  id="informed"
                  [options]="activeMembers" 
                  [(ngModel)]="topic.raci.iMemberIds"
                  optionLabel="displayName" 
                  optionValue="id"
                  placeholder="Informed auswählen..."
                  [filter]="true"
                  filterBy="displayName">
                </p-multiSelect>
              </div>
            </div>
          </div>
        </ng-template>

        <ng-template pTemplate="footer">
          <p-button label="Abbrechen" icon="pi pi-times" [text]="true" (onClick)="hideDialog()"></p-button>
          <p-button label="Speichern" icon="pi pi-check" (onClick)="saveTopic()" [loading]="saving"></p-button>
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
    }

    .page-header p {
      margin: 0;
      color: var(--p-text-muted-color);
    }

    .mb-4 {
      margin-bottom: 1.5rem;
    }

    .mr-1 {
      margin-right: 0.25rem;
    }

    .mb-1 {
      margin-bottom: 0.25rem;
    }

    .ml-2 {
      margin-left: 0.5rem;
    }

    .card {
      background: var(--p-surface-0);
      padding: 2rem;
      border-radius: var(--p-border-radius);
    }

    .text-center {
      text-align: center;
    }

    .text-secondary {
      color: var(--p-text-muted-color);
    }

    .text-sm {
      font-size: 0.875rem;
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
    }

    .field-group {
      border: 1px solid var(--p-surface-200);
      border-radius: var(--p-border-radius);
      padding: 1rem;
      margin-top: 0.5rem;
    }

    .field-group h4 {
      margin: 0 0 1rem 0;
    }

    .field-checkbox {
      display: flex;
      align-items: center;
      margin-bottom: 1rem;
    }

    .validity-dates {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .hint {
      color: var(--text-color-secondary);
      font-size: 0.875rem;
    }

    .tag-suggestion-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .tag-name {
      font-weight: 500;
    }

    .tag-hinweise {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
    }

    :host ::ng-deep .p-datatable .p-datatable-header {
      padding: 1rem;
    }
  `]
})
export class TopicsComponent implements OnInit, OnDestroy {
  @ViewChild('dt') table!: Table;

  topics: (Topic & { r1Name?: string; tagsString?: string; r1MemberId?: string })[] = [];
  topic: Topic = this.createEmptyTopic();
  members: TeamMember[] = [];
  activeMembers: MemberOption[] = [];
  memberOptions: MemberOption[] = [];
  
  topicDialog: boolean = false;
  editMode: boolean = false;
  submitted: boolean = false;
  saving: boolean = false;
  isConnected: boolean = false;

  // Filter values
  globalFilter: string = '';
  filterHeader: string = '';
  filterR1: string = '';
  filterTags: string[] = [];
  filterValidity: string = '';

  // Date helpers for form
  validFromDate: Date | null = null;
  validToDate: Date | null = null;

  // Filter options
  allTags: string[] = [];
  allKeywords: string[] = [];
  tagSuggestions: string[] = [];
  keywordSuggestions: string[] = [];
  validityOptions = [
    { label: 'Gültig', value: 'valid' },
    { label: 'Immer gültig', value: 'always' },
    { label: 'Ab Datum', value: 'future' },
    { label: 'Abgelaufen', value: 'expired' }
  ];

  // Managed tags
  managedTags: TagModel[] = [];
  managedTagsExist: boolean = false;

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
    this.activeMembers = datastore.members
      .filter(m => m.active)
      .map(m => ({ id: m.id, displayName: m.displayName }));
    this.memberOptions = datastore.members.map(m => ({ id: m.id, displayName: m.displayName }));

    // Load managed tags
    this.managedTags = datastore.tags || [];
    this.managedTagsExist = this.managedTags.length > 0;

    // Process topics with additional fields for filtering/sorting
    this.topics = datastore.topics.map(topic => ({
      ...topic,
      r1Name: this.getMemberName(topic.raci.r1MemberId),
      r1MemberId: topic.raci.r1MemberId,
      tagsString: topic.tags?.join(' ') || ''
    }));

    // Collect all unique tags from managed tags for filters
    this.allTags = this.managedTags.map(t => t.name).sort();

    // Collect all unique keywords
    const keywordSet = new Set<string>();
    datastore.topics.forEach(t => t.searchKeywords?.forEach(kw => keywordSet.add(kw)));
    this.allKeywords = Array.from(keywordSet).sort();
  }

  searchTags(event: { query: string }): void {
    const query = event.query.toLowerCase();
    
    // Filter from managed tags
    this.tagSuggestions = this.managedTags
      .filter(tag => {
        // Search by name
        if (tag.name.toLowerCase().includes(query)) return true;
        // Search by keywords
        if (tag.searchKeywords?.some(kw => kw.toLowerCase().includes(query))) return true;
        return false;
      })
      .map(tag => tag.name);
  }

  getTagHinweise(tagName: string): string {
    const tag = this.managedTags.find(t => t.name === tagName);
    return tag?.hinweise || '';
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

  createEmptyTopic(): Topic {
    return {
      id: '',
      header: '',
      description: '',
      tags: [],
      searchKeywords: [],
      validity: {
        alwaysValid: true
      },
      notes: '',
      raci: {
        r1MemberId: '',
        r2MemberId: undefined,
        r3MemberId: undefined,
        cMemberIds: [],
        iMemberIds: []
      },
      updatedAt: new Date().toISOString()
    };
  }

  openNewDialog(): void {
    this.topic = this.createEmptyTopic();
    this.validFromDate = null;
    this.validToDate = null;
    this.submitted = false;
    this.editMode = false;
    this.topicDialog = true;
  }

  editTopic(topic: Topic): void {
    this.topic = { 
      ...topic,
      tags: [...(topic.tags || [])],
      searchKeywords: [...(topic.searchKeywords || [])],
      validity: { ...topic.validity },
      raci: { 
        ...topic.raci,
        cMemberIds: [...topic.raci.cMemberIds],
        iMemberIds: [...topic.raci.iMemberIds]
      }
    };
    
    // Convert date strings to Date objects
    this.validFromDate = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    this.validToDate = topic.validity.validTo ? new Date(topic.validity.validTo) : null;
    
    this.submitted = false;
    this.editMode = true;
    this.topicDialog = true;
  }

  hideDialog(): void {
    this.topicDialog = false;
    this.submitted = false;
  }

  async saveTopic(): Promise<void> {
    this.submitted = true;

    // Validate required fields
    if (!this.topic.header?.trim()) {
      return;
    }

    if (!this.topic.raci.r1MemberId) {
      return;
    }

    if (!this.topic.validity.alwaysValid && !this.validFromDate) {
      return;
    }

    this.saving = true;

    try {
      // Convert dates to ISO strings
      if (!this.topic.validity.alwaysValid) {
        this.topic.validity.validFrom = this.toDateString(this.validFromDate);
        this.topic.validity.validTo = this.toDateString(this.validToDate);
      } else {
        this.topic.validity.validFrom = undefined;
        this.topic.validity.validTo = undefined;
      }

      let success: boolean;
      if (this.editMode) {
        success = await this.backend.updateTopic(this.topic.id, this.topic);
      } else {
        this.topic.id = this.backend.generateUUID();
        this.topic.updatedAt = new Date().toISOString();
        success = await this.backend.addTopic(this.topic);
      }

      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: this.editMode ? 'Thema aktualisiert' : 'Thema erstellt'
        });
        this.topicDialog = false;
        this.topic = this.createEmptyTopic();
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

  confirmDelete(topic: Topic): void {
    this.confirmationService.confirm({
      message: `Möchten Sie das Thema "${topic.header}" wirklich löschen?`,
      header: 'Löschen bestätigen',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Ja, löschen',
      rejectLabel: 'Abbrechen',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteTopic(topic)
    });
  }

  async deleteTopic(topic: Topic): Promise<void> {
    try {
      const success = await this.backend.deleteTopic(topic.id);
      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: 'Thema gelöscht'
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

  filterByTags(): void {
    if (this.filterTags.length === 0) {
      this.table?.filter(null, 'tagsString', 'contains');
    } else {
      // Custom filter - topics must have at least one of the selected tags
      // Escape special regex characters to prevent ReDoS
      const escapedTags = this.filterTags.map(tag => 
        tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      this.table?.filter(escapedTags.join('|'), 'tagsString', 'regexp');
    }
  }

  filterByValidity(): void {
    // Note: This requires custom filtering logic since it's not a direct field match
    // For now, we'll apply it as a simple filter
    if (this.filterValidity) {
      const now = new Date();
      const filtered = this.topics.filter(topic => {
        switch (this.filterValidity) {
          case 'always':
            return topic.validity.alwaysValid;
          case 'valid':
            return this.isTopicValid(topic);
          case 'future':
            if (topic.validity.alwaysValid) return false;
            const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
            return validFrom && now < validFrom;
          case 'expired':
            if (topic.validity.alwaysValid) return false;
            const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;
            return validTo && now > validTo;
          default:
            return true;
        }
      });
      this.table.filteredValue = filtered;
    } else {
      // Clear filter - PrimeNG expects undefined or empty array to clear filteredValue
      this.table.filteredValue = undefined as unknown as typeof this.topics;
    }
  }

  isTopicValid(topic: Topic): boolean {
    if (topic.validity.alwaysValid) return true;
    const now = new Date();
    const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;
    
    if (validFrom && now < validFrom) return false;
    if (validTo && now > validTo) return false;
    return true;
  }

  onAlwaysValidChange(): void {
    if (this.topic.validity.alwaysValid) {
      this.validFromDate = null;
      this.validToDate = null;
    }
  }

  getMemberName(memberId: string): string {
    const member = this.members.find(m => m.id === memberId);
    return member?.displayName || 'Unbekannt';
  }

  getValidityBadge(topic: Topic): string {
    if (topic.validity.alwaysValid) {
      return 'Immer gültig';
    }

    const now = new Date();
    const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;

    if (validFrom && now < validFrom) {
      return `Ab ${this.formatDateShort(topic.validity.validFrom!)}`;
    }

    if (validTo && now > validTo) {
      return 'Abgelaufen';
    }

    if (validFrom && validTo) {
      return `Bis ${this.formatDateShort(topic.validity.validTo!)}`;
    }

    return 'Gültig';
  }

  getValiditySeverity(topic: Topic): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    if (topic.validity.alwaysValid) {
      return 'success';
    }

    const now = new Date();
    const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;

    if (validFrom && now < validFrom) {
      return 'warn';
    }

    if (validTo && now > validTo) {
      return 'danger';
    }

    return 'info';
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

  formatDateShort(isoString: string): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('de-DE');
  }

  /**
   * Convert a Date object to ISO date string (YYYY-MM-DD) or undefined
   */
  private toDateString(date: Date | null): string | undefined {
    return date ? date.toISOString().split('T')[0] : undefined;
  }
}
