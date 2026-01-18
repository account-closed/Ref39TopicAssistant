import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
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
import { ColorPicker } from 'primeng/colorpicker';
import { Checkbox } from 'primeng/checkbox';
import { Tooltip } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { LoadConfigService } from '../../core/services/load-config.service';
import { TeamMember, Topic, Datastore, LoadConfig } from '../../core/models';

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
    InputNumber,
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
    Select,
    ColorPicker,
    Checkbox,
    Tooltip
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss'
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

  globalFilter: string = '';

  selectedMemberName: string = '';
  responsibleTopics: TopicAssignment[] = [];
  consultedTopics: TopicAssignment[] = [];
  informedTopics: TopicAssignment[] = [];

  memberToDelete: TeamMember | null = null;

  private topicCountCache: Map<string, number> = new Map();

  allTags: string[] = [];
  tagSuggestions: string[] = [];

  statusOptions = [
    { label: 'Aktiv', value: true },
    { label: 'Inaktiv', value: false }
  ];

  // Load config related properties
  loadConfig: LoadConfig | null = null;
  memberPartTimePercent: number = 100; // Display as percentage (1-100)
  hasBaseLoadOverride: boolean = false;
  memberBaseLoadOverride: number | null = null;
  defaultBaseLoad: number = 3.5; // Computed from config

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private loadConfigService: LoadConfigService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
        // Ensure load config is loaded when connected
        if (connected && !this.loadConfigService.getConfig()) {
          void this.loadConfigService.loadOrCreate().catch(err => {
            console.error('[Members] Failed to load config:', err);
          });
        }
      })
    );

    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        if (datastore) {
          this.loadData(datastore);
        }
      })
    );

    this.subscriptions.push(
      this.loadConfigService.config$.subscribe(config => {
        this.applyLoadConfig(config);
      })
    );

    // Load existing config synchronously if already available
    this.applyLoadConfig(this.loadConfigService.getConfig());
  }

  /**
   * Apply load config values to component state.
   */
  private applyLoadConfig(config: LoadConfig | null): void {
    this.loadConfig = config;
    if (config) {
      this.defaultBaseLoad = config.baseLoad.components
        .filter(c => c.enabled)
        .reduce((sum, c) => sum + c.hoursPerWeek, 0);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadData(datastore: Datastore): void {
    this.topics = datastore.topics;
    
    this.members = datastore.members.map(member => ({
      ...member,
      tagsString: member.tags?.join(' ') || ''
    }));

    this.topicCountCache.clear();
    datastore.members.forEach(member => {
      this.topicCountCache.set(member.id, this.calculateTopicCount(member.id));
    });

    const tagSet = new Set<string>();
    datastore.members.forEach(m => m.tags?.forEach(tag => tagSet.add(tag)));
    this.allTags = Array.from(tagSet).sort();
  }

  searchTags(event: { query: string }): void {
    const query = event.query.toLowerCase();
    this.tagSuggestions = this.allTags.filter(tag => 
      tag.toLowerCase().includes(query)
    );
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
    // Reset load config fields for new member
    this.memberPartTimePercent = 100;
    this.hasBaseLoadOverride = false;
    this.memberBaseLoadOverride = null;
    this.memberDialog = true;
  }

  editMember(member: TeamMember): void {
    this.member = { 
      ...member,
      tags: [...(member.tags || [])]
    };
    this.submitted = false;
    this.editMode = true;
    // Load load config values from member data
    const partTimeFactor = member.partTimeFactor ?? 1.0;
    this.memberPartTimePercent = Math.round(partTimeFactor * 100);
    if (member.baseLoadOverride !== undefined && member.baseLoadOverride !== null) {
      this.hasBaseLoadOverride = true;
      this.memberBaseLoadOverride = member.baseLoadOverride;
    } else {
      this.hasBaseLoadOverride = false;
      this.memberBaseLoadOverride = null;
    }
    this.memberDialog = true;
  }

  hideDialog(): void {
    this.memberDialog = false;
    this.submitted = false;
  }

  async saveMember(): Promise<void> {
    this.submitted = true;

    if (!this.member.displayName?.trim()) {
      return;
    }

    this.saving = true;

    try {
      // Apply load config values to member
      const partTimeFactor = Math.round(this.memberPartTimePercent) / 100;
      if (partTimeFactor < 1.0) {
        this.member.partTimeFactor = partTimeFactor;
      } else {
        // Remove if 100% (default)
        delete this.member.partTimeFactor;
      }

      if (this.hasBaseLoadOverride && this.memberBaseLoadOverride !== null) {
        this.member.baseLoadOverride = this.memberBaseLoadOverride;
      } else {
        // Remove override if disabled
        delete this.member.baseLoadOverride;
      }

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
      this.memberToDelete = member;
      this.deactivateDialog = true;
    } else {
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

  /**
   * Get the default base load from enabled components.
   */
  getDefaultBaseLoad(): number {
    if (!this.loadConfig) {
      return 3.5; // Default value
    }
    return this.loadConfig.baseLoad.components
      .filter(c => c.enabled)
      .reduce((sum, c) => sum + c.hoursPerWeek, 0);
  }
}
