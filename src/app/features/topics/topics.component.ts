import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Table, TableModule } from 'primeng/table';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
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
import { Rating } from 'primeng/rating';
import { Tooltip } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { IrregularTaskService, IrregularTaskResult, IrregularTaskValidation } from '../../core/services/irregular-task.service';
import { Topic, TeamMember, Datastore, Tag as TagModel, TShirtSize, TopicConnection, TopicConnectionType, TaskCategory, DEFAULT_IRREGULAR_ESTIMATION, VARIANCE_CLASS_OPTIONS, WAVE_CLASS_OPTIONS } from '../../core/models';
import { getPriorityStars, getSizeSeverity } from '../../shared/utils/topic-display.utils';
import { isValidKeyword, sanitizeKeyword } from '../../shared/utils/validation.utils';
import { formatHoursMinutes } from '../../shared/utils/time-format.utils';
import { PageWrapperComponent } from '../../shared/components';

interface MemberOption {
  id: string;
  displayName: string;
}

interface TopicOption {
  id: string;
  header: string;
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
    InputNumber,
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
    InputIcon,
    Rating,
    Tooltip,
    PageWrapperComponent
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './topics.component.html',
  styleUrl: './topics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
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

  globalFilter: string = '';
  filterHeader: string = '';
  filterR1: string = '';
  filterTags: string[] = [];
  filterValidity: string = '';

  validFromDate: Date | null = null;
  validToDate: Date | null = null;

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

  sizeOptions: { label: string; value: TShirtSize }[] = [
    { label: 'XXS', value: 'XXS' },
    { label: 'XS', value: 'XS' },
    { label: 'S', value: 'S' },
    { label: 'M', value: 'M' },
    { label: 'L', value: 'L' },
    { label: 'XL', value: 'XL' },
    { label: 'XXL', value: 'XXL' }
  ];

  priorityOptions = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
    { label: '5', value: 5 },
    { label: '6', value: 6 },
    { label: '7', value: 7 },
    { label: '8', value: 8 },
    { label: '9', value: 9 },
    { label: '10', value: 10 }
  ];

  connectionTypeOptions: { label: string; value: TopicConnectionType }[] = [
    { label: 'Abhängig von', value: 'dependsOn' },
    { label: 'Blockiert', value: 'blocks' },
    { label: 'Verwandt mit', value: 'relatedTo' }
  ];

  taskCategoryOptions: { label: string; value: TaskCategory }[] = [
    { label: 'Regulär', value: 'REGULAR' },
    { label: 'Irregulär', value: 'IRREGULAR' }
  ];

  varianceClassOptions = VARIANCE_CLASS_OPTIONS;
  waveClassOptions = WAVE_CLASS_OPTIONS;

  calculatedP80Result: IrregularTaskResult | null = null;
  irregularValidation: IrregularTaskValidation | null = null;

  /** All topics available for connection selection. Filtered by getAvailableTopicsForConnection() to exclude current topic. */
  topicOptions: TopicOption[] = [];

  /** Cached list of available topics for connection (excludes current topic). Updated when dialog opens. */
  availableTopicsForConnection: TopicOption[] = [];

  managedTags: TagModel[] = [];
  managedTagsExist: boolean = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private irregularTaskService: IrregularTaskService
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
    this.activeMembers = datastore.members
      .filter(m => m.active)
      .map(m => ({ id: m.id, displayName: m.displayName }));
    this.memberOptions = datastore.members.map(m => ({ id: m.id, displayName: m.displayName }));

    this.managedTags = datastore.tags || [];
    this.managedTagsExist = this.managedTags.length > 0;

    this.topics = datastore.topics.map(topic => ({
      ...topic,
      r1Name: this.getMemberName(topic.raci.r1MemberId),
      r1MemberId: topic.raci.r1MemberId,
      tagsString: topic.tags?.join(' ') || ''
    }));

    // Build all topic options for connection selection
    this.topicOptions = datastore.topics.map(t => ({ id: t.id, header: t.header }));

    this.allTags = this.managedTags.map(t => t.name).sort();

    const keywordSet = new Set<string>();
    datastore.topics.forEach(t => t.searchKeywords?.forEach(kw => keywordSet.add(kw)));
    this.allKeywords = Array.from(keywordSet).sort();
  }

  searchTags(event: { query: string }): void {
    const query = event.query.toLowerCase();
    
    this.tagSuggestions = this.managedTags
      .filter(tag => {
        if (tag.name.toLowerCase().includes(query)) return true;
        if (tag.searchKeywords?.some(kw => kw.toLowerCase().includes(query))) return true;
        return false;
      })
      .map(tag => tag.name);
  }

  getTagHinweise(tagName: string): string {
    const tag = this.managedTags.find(t => t.name === tagName);
    return tag?.hinweise || '';
  }

  getTagColor(tagName: string): string | undefined {
    const tag = this.managedTags.find(t => t.name === tagName);
    return tag?.color;
  }

  getTagStyle(tagName: string): { [key: string]: string } {
    const color = this.getTagColor(tagName);
    return color ? { 'background-color': color } : {};
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
    if (!event.value || !this.topic.searchKeywords) return;
    
    const sanitized = sanitizeKeyword(event.value);
    
    if (!isValidKeyword(sanitized)) {
      // Remove the invalid keyword if it was added
      const index = this.topic.searchKeywords.indexOf(event.value);
      if (index > -1) {
        this.topic.searchKeywords.splice(index, 1);
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
      const index = this.topic.searchKeywords.indexOf(event.value);
      if (index > -1) {
        this.topic.searchKeywords[index] = sanitized;
      }
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
      updatedAt: new Date().toISOString(),
      priority: undefined,
      hasFileNumber: false,
      fileNumber: '',
      hasSharedFilePath: false,
      sharedFilePath: '',
      size: undefined,
      connections: [],
      taskCategory: 'REGULAR',
      irregularEstimation: undefined
    };
  }

  openNewDialog(): void {
    this.topic = this.createEmptyTopic();
    this.validFromDate = null;
    this.validToDate = null;
    this.submitted = false;
    this.editMode = false;
    this.updateAvailableTopicsForConnection();
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
      },
      connections: topic.connections ? topic.connections.map(c => ({ ...c })) : [],
      taskCategory: topic.taskCategory || 'REGULAR',
      irregularEstimation: topic.irregularEstimation ? { ...topic.irregularEstimation } : undefined
    };
    
    this.validFromDate = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    this.validToDate = topic.validity.validTo ? new Date(topic.validity.validTo) : null;
    
    // Calculate P80 if irregular task
    this.updateP80Calculation();
    
    this.submitted = false;
    this.editMode = true;
    this.updateAvailableTopicsForConnection();
    this.topicDialog = true;
  }

  hideDialog(): void {
    this.topicDialog = false;
    this.submitted = false;
  }

  async saveTopic(): Promise<void> {
    this.submitted = true;

    if (!this.topic.header?.trim()) {
      return;
    }

    // R1 is now optional - topics without R1 are marked as orphan

    if (!this.topic.validity.alwaysValid && !this.validFromDate) {
      return;
    }

    this.saving = true;

    try {
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
      const escapedTags = this.filterTags.map(tag => 
        tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      this.table?.filter(escapedTags.join('|'), 'tagsString', 'regexp');
    }
  }

  filterByValidity(): void {
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

  onHasFileNumberChange(): void {
    if (!this.topic.hasFileNumber) {
      this.topic.fileNumber = '';
    }
  }

  onHasSharedFilePathChange(): void {
    if (!this.topic.hasSharedFilePath) {
      this.topic.sharedFilePath = '';
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

  private toDateString(date: Date | null): string | undefined {
    return date ? date.toISOString().split('T')[0] : undefined;
  }

  getPriorityStars(priority: number | undefined): string {
    return getPriorityStars(priority);
  }

  getSizeSeverity(size: TShirtSize | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return getSizeSeverity(size);
  }

  /**
   * Get available topics for connection selection (excludes current topic).
   */
  getAvailableTopicsForConnection(): TopicOption[] {
    return this.availableTopicsForConnection;
  }

  /**
   * Update the cached list of available topics for connection.
   * Called when dialog opens to exclude current topic.
   */
  private updateAvailableTopicsForConnection(): void {
    this.availableTopicsForConnection = this.topicOptions.filter(t => t.id !== this.topic.id);
  }

  /**
   * Add a new empty connection to the current topic.
   */
  addConnection(): void {
    if (!this.topic.connections) {
      this.topic.connections = [];
    }
    this.topic.connections.push({
      targetTopicId: '',
      type: 'relatedTo'
    });
  }

  /**
   * Remove a connection at the specified index.
   */
  removeConnection(index: number): void {
    if (this.topic.connections) {
      this.topic.connections.splice(index, 1);
    }
  }

  /**
   * Get the header/title of a topic by its ID.
   */
  getTopicHeader(topicId: string): string {
    const topic = this.topicOptions.find(t => t.id === topicId);
    return topic?.header || 'Unbekannt';
  }

  /**
   * Get the label for a connection type.
   */
  getConnectionTypeLabel(type: TopicConnectionType): string {
    const option = this.connectionTypeOptions.find(o => o.value === type);
    return option?.label || type;
  }

  /**
   * Get the count of connections for a topic.
   */
  getConnectionCount(topic: Topic): number {
    return topic.connections?.length || 0;
  }

  /**
   * Handle task category change
   */
  onTaskCategoryChange(): void {
    if (this.topic.taskCategory === 'IRREGULAR') {
      // Initialize irregular estimation if not present
      if (!this.topic.irregularEstimation) {
        this.topic.irregularEstimation = { ...DEFAULT_IRREGULAR_ESTIMATION };
      }
      // Clear t-shirt size when switching to irregular
      this.topic.size = undefined;
      this.updateP80Calculation();
    } else {
      // Clear irregular estimation when switching to regular
      this.topic.irregularEstimation = undefined;
      this.calculatedP80Result = null;
      this.irregularValidation = null;
    }
  }

  /**
   * Update P80 calculation when irregular estimation changes
   */
  updateP80Calculation(): void {
    if (this.topic.taskCategory === 'IRREGULAR' && this.topic.irregularEstimation) {
      this.calculatedP80Result = this.irregularTaskService.calculateP80(this.topic.irregularEstimation);
      this.irregularValidation = this.irregularTaskService.validate(this.topic.irregularEstimation);
    } else {
      this.calculatedP80Result = null;
      this.irregularValidation = null;
    }
  }

  /**
   * Handle irregular estimation field changes
   */
  onIrregularEstimationChange(): void {
    this.updateP80Calculation();
  }

  /**
   * Get frequency-related errors for inline display
   */
  getFrequencyErrors(): string[] {
    if (!this.irregularValidation?.errors) return [];
    return this.irregularValidation.errors.filter(e => 
      e.toLowerCase().includes('häufigkeit') || e.toLowerCase().includes('frequency')
    );
  }

  /**
   * Get effort-related errors for inline display
   */
  getEffortErrors(): string[] {
    if (!this.irregularValidation?.errors) return [];
    return this.irregularValidation.errors.filter(e => 
      e.toLowerCase().includes('aufwand') || e.toLowerCase().includes('effort')
    );
  }

  /**
   * Get tooltip for variance class dropdown
   */
  getVarianceTooltip(): string {
    const option = this.varianceClassOptions.find(o => o.value === this.topic.irregularEstimation?.varianceClass);
    return option?.description || 'Wie stark variiert die Aufgabe?';
  }

  /**
   * Get tooltip for wave class dropdown
   */
  getWaveTooltip(): string {
    const option = this.waveClassOptions.find(o => o.value === this.topic.irregularEstimation?.waveClass);
    return option?.description || 'Wie stark clustern sich die Ereignisse?';
  }

  formatHoursMinutes = formatHoursMinutes;
}
