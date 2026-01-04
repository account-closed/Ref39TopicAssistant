import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Dialog } from 'primeng/dialog';
import { AutoComplete } from 'primeng/autocomplete';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tag } from 'primeng/tag';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { Select } from 'primeng/select';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { TeamMember, Topic, Datastore } from '../../core/models';

interface TopicAssignment {
  topic: Topic;
  role: 'R1' | 'R2' | 'R3' | 'C' | 'I';
}

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    Button,
    InputText,
    Dialog,
    AutoComplete,
    ToggleSwitch,
    Tag,
    ConfirmDialog,
    Toast,
    Toolbar,
    IconField,
    InputIcon,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    Select
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <div class="page-container">
      <p-toast></p-toast>
      <p-confirmDialog></p-confirmDialog>

      <div class="page-header">
        <h1>Teammitglieder verwalten</h1>
        <p>Erstellen, bearbeiten und verwalten Sie Teammitglieder</p>
      </div>

      <p-toolbar styleClass="mb-4">
        <ng-template #start>
          <p-button 
            label="Neues Mitglied" 
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
        [value]="members" 
        [paginator]="true" 
        [rows]="10"
        [rowsPerPageOptions]="[10, 25, 50]"
        [globalFilterFields]="['displayName', 'email', 'tagsString']"
        [sortField]="'displayName'"
        [sortOrder]="1"
        styleClass="p-datatable-striped"
        [tableStyle]="{'min-width': '50rem'}">
        
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="displayName" style="min-width:12rem">
              Name <p-sortIcon field="displayName"></p-sortIcon>
            </th>
            <th pSortableColumn="email" style="min-width:14rem">
              E-Mail <p-sortIcon field="email"></p-sortIcon>
            </th>
            <th style="min-width:10rem">Tags</th>
            <th pSortableColumn="active" style="min-width:6rem">
              Status <p-sortIcon field="active"></p-sortIcon>
            </th>
            <th style="min-width:6rem">Themen</th>
            <th pSortableColumn="updatedAt" style="min-width:10rem">
              Aktualisiert <p-sortIcon field="updatedAt"></p-sortIcon>
            </th>
            <th style="min-width:10rem">Aktionen</th>
          </tr>
          <tr>
            <th>
              <input 
                pInputText 
                type="text" 
                (input)="dt.filter($any($event.target).value, 'displayName', 'contains')"
                placeholder="Filter..." 
                class="w-full" />
            </th>
            <th>
              <input 
                pInputText 
                type="text" 
                (input)="dt.filter($any($event.target).value, 'email', 'contains')"
                placeholder="Filter..." 
                class="w-full" />
            </th>
            <th></th>
            <th>
              <p-select 
                [options]="statusOptions" 
                (onChange)="dt.filter($event.value, 'active', 'equals')"
                placeholder="Alle"
                [showClear]="true"
                styleClass="w-full">
              </p-select>
            </th>
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </ng-template>
        
        <ng-template pTemplate="body" let-member>
          <tr>
            <td>
              <strong>{{ member.displayName }}</strong>
            </td>
            <td>{{ member.email || '-' }}</td>
            <td>
              <p-tag *ngFor="let tag of member.tags" [value]="tag" severity="info" styleClass="mr-1 mb-1"></p-tag>
            </td>
            <td>
              <p-tag 
                [value]="member.active ? 'Aktiv' : 'Inaktiv'" 
                [severity]="member.active ? 'success' : 'secondary'">
              </p-tag>
            </td>
            <td>
              <p-button 
                [label]="getTopicCount(member.id).toString()" 
                icon="pi pi-list" 
                [rounded]="true" 
                [text]="true" 
                severity="info" 
                (onClick)="viewTopics(member)"
                [badge]="getTopicCount(member.id) > 0 ? '' : undefined">
              </p-button>
            </td>
            <td>{{ formatDate(member.updatedAt) }}</td>
            <td>
              <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" (onClick)="editMember(member)"></p-button>
              <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="confirmDelete(member)"></p-button>
            </td>
          </tr>
        </ng-template>

        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="7" class="text-center">
              <i class="pi pi-users" style="font-size: 2rem; color: var(--text-color-muted);"></i>
              <p>Keine Teammitglieder gefunden</p>
            </td>
          </tr>
        </ng-template>
      </p-table>

      <!-- Create/Edit Dialog -->
      <p-dialog 
        [(visible)]="memberDialog" 
        [style]="{width: '500px'}" 
        [header]="editMode ? 'Mitglied bearbeiten' : 'Neues Mitglied'" 
        [modal]="true"
        [closable]="true"
        styleClass="p-fluid">
        
        <ng-template pTemplate="content">
          <div class="form-grid">
            <!-- Display Name (required) -->
            <div class="field">
              <label for="displayName">Name *</label>
              <input 
                pInputText 
                id="displayName" 
                [(ngModel)]="member.displayName" 
                required 
                autofocus
                [class.ng-invalid]="submitted && !member.displayName"
                [class.ng-dirty]="submitted && !member.displayName" />
              <small class="p-error" *ngIf="submitted && !member.displayName">Name ist erforderlich.</small>
            </div>

            <!-- Email -->
            <div class="field">
              <label for="email">E-Mail</label>
              <input 
                pInputText 
                id="email" 
                [(ngModel)]="member.email"
                type="email" />
            </div>

            <!-- Tags -->
            <div class="field">
              <label for="tags">Tags</label>
              <p-autoComplete 
                id="tags" 
                [(ngModel)]="member.tags"
                [multiple]="true"
                [suggestions]="tagSuggestions"
                (completeMethod)="searchTags($event)"
                placeholder="Tags hinzufügen...">
              </p-autoComplete>
            </div>

            <!-- Active Status -->
            <div class="field-checkbox">
              <p-toggleswitch 
                [(ngModel)]="member.active" 
                inputId="active">
              </p-toggleswitch>
              <label for="active" class="ml-2">Aktiv</label>
            </div>
          </div>
        </ng-template>

        <ng-template pTemplate="footer">
          <p-button label="Abbrechen" icon="pi pi-times" [text]="true" (onClick)="hideDialog()"></p-button>
          <p-button label="Speichern" icon="pi pi-check" (onClick)="saveMember()" [loading]="saving"></p-button>
        </ng-template>
      </p-dialog>

      <!-- Topics by Member Dialog -->
      <p-dialog 
        [(visible)]="topicsDialog" 
        [style]="{width: '800px'}" 
        [header]="'Themen von ' + selectedMemberName"
        [modal]="true"
        [closable]="true">
        
        <ng-template pTemplate="content">
          <p-tabs value="0">
            <p-tablist>
              <p-tab value="0">Verantwortlich (R)</p-tab>
              <p-tab value="1">Consulted (C)</p-tab>
              <p-tab value="2">Informed (I)</p-tab>
            </p-tablist>
            <p-tabpanels>
              <p-tabpanel value="0">
                <p-table [value]="responsibleTopics" styleClass="p-datatable-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Thema</th>
                      <th>Rolle</th>
                      <th>Gültigkeit</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-item>
                    <tr>
                      <td>{{ item.topic.header }}</td>
                      <td><p-tag [value]="item.role" severity="info"></p-tag></td>
                      <td><p-tag [value]="getValidityBadge(item.topic)" [severity]="getValiditySeverity(item.topic)"></p-tag></td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr>
                      <td colspan="3" class="text-center text-secondary">Keine Themen in dieser Rolle</td>
                    </tr>
                  </ng-template>
                </p-table>
              </p-tabpanel>
              
              <p-tabpanel value="1">
                <p-table [value]="consultedTopics" styleClass="p-datatable-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Thema</th>
                      <th>Gültigkeit</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-item>
                    <tr>
                      <td>{{ item.topic.header }}</td>
                      <td><p-tag [value]="getValidityBadge(item.topic)" [severity]="getValiditySeverity(item.topic)"></p-tag></td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr>
                      <td colspan="2" class="text-center text-secondary">Keine Themen in dieser Rolle</td>
                    </tr>
                  </ng-template>
                </p-table>
              </p-tabpanel>
              
              <p-tabpanel value="2">
                <p-table [value]="informedTopics" styleClass="p-datatable-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Thema</th>
                      <th>Gültigkeit</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-item>
                    <tr>
                      <td>{{ item.topic.header }}</td>
                      <td><p-tag [value]="getValidityBadge(item.topic)" [severity]="getValiditySeverity(item.topic)"></p-tag></td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr>
                      <td colspan="2" class="text-center text-secondary">Keine Themen in dieser Rolle</td>
                    </tr>
                  </ng-template>
                </p-table>
              </p-tabpanel>
            </p-tabpanels>
          </p-tabs>
        </ng-template>
      </p-dialog>

      <!-- Deactivate Offer Dialog -->
      <p-dialog 
        [(visible)]="deactivateDialog" 
        [style]="{width: '450px'}" 
        header="Mitglied wird verwendet"
        [modal]="true"
        [closable]="true">
        
        <ng-template pTemplate="content">
          <div class="deactivate-content">
            <i class="pi pi-exclamation-triangle" style="font-size: 2rem; color: var(--yellow-500);"></i>
            <p>
              Das Mitglied <strong>{{ memberToDelete?.displayName }}</strong> ist {{ getTopicCount(memberToDelete?.id || '') }} Themen zugeordnet 
              und kann daher nicht gelöscht werden.
            </p>
            <p>Möchten Sie das Mitglied stattdessen deaktivieren?</p>
          </div>
        </ng-template>

        <ng-template pTemplate="footer">
          <p-button label="Abbrechen" icon="pi pi-times" [text]="true" (onClick)="deactivateDialog = false"></p-button>
          <p-button label="Deaktivieren" icon="pi pi-user-minus" severity="warn" (onClick)="deactivateMember()" [loading]="saving"></p-button>
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

    .field-checkbox {
      display: flex;
      align-items: center;
      margin-top: 0.5rem;
    }

    .deactivate-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 1rem;
      padding: 1rem;
    }

    .deactivate-content p {
      margin: 0;
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
export class MembersComponent implements OnInit, OnDestroy {
  @ViewChild('dt') table!: Table;

  members: (TeamMember & { tagsString?: string })[] = [];
  topics: Topic[] = [];
  member: TeamMember = this.createEmptyMember();
  
  memberDialog: boolean = false;
  topicsDialog: boolean = false;
  deactivateDialog: boolean = false;
  editMode: boolean = false;
  submitted: boolean = false;
  saving: boolean = false;
  isConnected: boolean = false;

  // Filter values
  globalFilter: string = '';

  // Selected member for topics view
  selectedMemberName: string = '';
  responsibleTopics: TopicAssignment[] = [];
  consultedTopics: TopicAssignment[] = [];
  informedTopics: TopicAssignment[] = [];

  // Member to delete (for deactivate dialog)
  memberToDelete: TeamMember | null = null;

  // Topic counts cache
  private topicCountCache: Map<string, number> = new Map();

  // Tag suggestions for autocomplete
  allTags: string[] = [];
  tagSuggestions: string[] = [];

  statusOptions = [
    { label: 'Aktiv', value: true },
    { label: 'Inaktiv', value: false }
  ];

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
    this.topics = datastore.topics;
    
    // Process members with additional fields for filtering
    this.members = datastore.members.map(member => ({
      ...member,
      tagsString: member.tags?.join(' ') || ''
    }));

    // Build topic count cache
    this.topicCountCache.clear();
    datastore.members.forEach(member => {
      this.topicCountCache.set(member.id, this.calculateTopicCount(member.id));
    });

    // Collect all unique tags
    const tagSet = new Set<string>();
    datastore.members.forEach(m => m.tags?.forEach(tag => tagSet.add(tag)));
    this.allTags = Array.from(tagSet).sort();
  }

  searchTags(event: { query: string }): void {
    const query = event.query.toLowerCase();
    this.tagSuggestions = this.allTags.filter(tag => 
      tag.toLowerCase().includes(query)
    );
    // Allow adding new tags
    if (query && !this.tagSuggestions.includes(query)) {
      this.tagSuggestions.unshift(query);
    }
  }

  private calculateTopicCount(memberId: string): number {
    let count = 0;
    this.topics.forEach(topic => {
      if (topic.raci.r1MemberId === memberId) count++;
      if (topic.raci.r2MemberId === memberId) count++;
      if (topic.raci.r3MemberId === memberId) count++;
      if (topic.raci.cMemberIds.includes(memberId)) count++;
      if (topic.raci.iMemberIds.includes(memberId)) count++;
    });
    return count;
  }

  getTopicCount(memberId: string): number {
    return this.topicCountCache.get(memberId) || 0;
  }

  createEmptyMember(): TeamMember {
    return {
      id: '',
      displayName: '',
      email: '',
      active: true,
      tags: [],
      updatedAt: new Date().toISOString()
    };
  }

  openNewDialog(): void {
    this.member = this.createEmptyMember();
    this.submitted = false;
    this.editMode = false;
    this.memberDialog = true;
  }

  editMember(member: TeamMember): void {
    this.member = { 
      ...member,
      tags: [...(member.tags || [])]
    };
    this.submitted = false;
    this.editMode = true;
    this.memberDialog = true;
  }

  hideDialog(): void {
    this.memberDialog = false;
    this.submitted = false;
  }

  async saveMember(): Promise<void> {
    this.submitted = true;

    // Validate required fields
    if (!this.member.displayName?.trim()) {
      return;
    }

    this.saving = true;

    try {
      let success: boolean;
      if (this.editMode) {
        success = await this.backend.updateMember(this.member.id, this.member);
      } else {
        this.member.id = this.backend.generateUUID();
        this.member.updatedAt = new Date().toISOString();
        success = await this.backend.addMember(this.member);
      }

      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: this.editMode ? 'Mitglied aktualisiert' : 'Mitglied erstellt'
        });
        this.memberDialog = false;
        this.member = this.createEmptyMember();
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

  confirmDelete(member: TeamMember): void {
    const topicCount = this.getTopicCount(member.id);
    
    if (topicCount > 0) {
      // Member is referenced by topics - offer deactivation
      this.memberToDelete = member;
      this.deactivateDialog = true;
    } else {
      // Member can be deleted
      this.confirmationService.confirm({
        message: `Möchten Sie das Mitglied "${member.displayName}" wirklich löschen?`,
        header: 'Löschen bestätigen',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Ja, löschen',
        rejectLabel: 'Abbrechen',
        acceptButtonStyleClass: 'p-button-danger',
        accept: () => this.deleteMember(member)
      });
    }
  }

  async deleteMember(member: TeamMember): Promise<void> {
    try {
      const success = await this.backend.deleteMember(member.id);
      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: 'Mitglied gelöscht'
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

  async deactivateMember(): Promise<void> {
    if (!this.memberToDelete) return;

    this.saving = true;

    try {
      const success = await this.backend.updateMember(this.memberToDelete.id, { active: false });
      if (success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Erfolgreich',
          detail: 'Mitglied deaktiviert'
        });
        this.deactivateDialog = false;
        this.memberToDelete = null;
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Fehler',
          detail: 'Deaktivierung fehlgeschlagen. Möglicherweise ist die Datei gesperrt.'
        });
      }
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: 'Unerwarteter Fehler: ' + (error as Error).message
      });
    } finally {
      this.saving = false;
    }
  }

  viewTopics(member: TeamMember): void {
    this.selectedMemberName = member.displayName;
    
    // Build topic lists grouped by role
    this.responsibleTopics = [];
    this.consultedTopics = [];
    this.informedTopics = [];

    this.topics.forEach(topic => {
      if (topic.raci.r1MemberId === member.id) {
        this.responsibleTopics.push({ topic, role: 'R1' });
      }
      if (topic.raci.r2MemberId === member.id) {
        this.responsibleTopics.push({ topic, role: 'R2' });
      }
      if (topic.raci.r3MemberId === member.id) {
        this.responsibleTopics.push({ topic, role: 'R3' });
      }
      if (topic.raci.cMemberIds.includes(member.id)) {
        this.consultedTopics.push({ topic, role: 'C' });
      }
      if (topic.raci.iMemberIds.includes(member.id)) {
        this.informedTopics.push({ topic, role: 'I' });
      }
    });

    this.topicsDialog = true;
  }

  onGlobalFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.table?.filterGlobal(value, 'contains');
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
}
