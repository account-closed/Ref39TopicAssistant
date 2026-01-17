import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Select } from 'primeng/select';
import { MultiSelect } from 'primeng/multiselect';
import { Rating } from 'primeng/rating';
import { Toolbar } from 'primeng/toolbar';
import { Button } from 'primeng/button';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { Topic, TeamMember, Datastore, Tag as TagModel, TShirtSize } from '../../core/models';
import { getSizeSeverity } from '../../shared/utils/topic-display.utils';

interface MemberOption {
  id: string;
  displayName: string;
}

interface TopicWithRoles {
  topic: Topic;
  roles: string[]; // Roles this member has for this topic
}

@Component({
  selector: 'app-topics-by-member',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    Tag,
    Tooltip,
    Select,
    MultiSelect,
    Rating,
    Toolbar,
    Button
  ],
  templateUrl: './topics-by-member.component.html',
  styleUrl: './topics-by-member.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopicsByMemberComponent implements OnInit, OnDestroy {
  // State signals
  isConnected = signal(false);
  members = signal<TeamMember[]>([]);
  topics = signal<Topic[]>([]);
  allTags = signal<TagModel[]>([]);
  
  // Filter signals (internal)
  private _selectedMemberId = signal<string | null>(null);
  private _filterRoles = signal<string[]>([]);
  private _filterTags = signal<string[]>([]);
  private _filterSuperTagOnly = signal(false);
  private _filterGvplTagOnly = signal(false);
  private _filterPriorityMin = signal<number | null>(null);
  private _filterPriorityMax = signal<number | null>(null);
  private _filterSizes = signal<TShirtSize[]>([]);
  private _filterValidity = signal<string[]>([]);

  // Getter/Setter properties for ngModel compatibility
  get selectedMemberId(): string | null { return this._selectedMemberId(); }
  set selectedMemberId(value: string | null) { this._selectedMemberId.set(value); }

  get filterRoles(): string[] { return this._filterRoles(); }
  set filterRoles(value: string[]) { this._filterRoles.set(value); }

  get filterTags(): string[] { return this._filterTags(); }
  set filterTags(value: string[]) { this._filterTags.set(value); }

  get filterSuperTagOnly(): boolean { return this._filterSuperTagOnly(); }
  set filterSuperTagOnly(value: boolean) { this._filterSuperTagOnly.set(value); }

  get filterGvplTagOnly(): boolean { return this._filterGvplTagOnly(); }
  set filterGvplTagOnly(value: boolean) { this._filterGvplTagOnly.set(value); }

  get filterPriorityMin(): number | null { return this._filterPriorityMin(); }
  set filterPriorityMin(value: number | null) { this._filterPriorityMin.set(value); }

  get filterPriorityMax(): number | null { return this._filterPriorityMax(); }
  set filterPriorityMax(value: number | null) { this._filterPriorityMax.set(value); }

  get filterSizes(): TShirtSize[] { return this._filterSizes(); }
  set filterSizes(value: TShirtSize[]) { this._filterSizes.set(value); }

  get filterValidity(): string[] { return this._filterValidity(); }
  set filterValidity(value: string[]) { this._filterValidity.set(value); }

  // Computed: active members for dropdown
  activeMemberOptions = computed<MemberOption[]>(() => 
    this.members()
      .filter(m => m.active)
      .map(m => ({ id: m.id, displayName: m.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  // Computed: selected member name
  selectedMemberName = computed(() => {
    const memberId = this._selectedMemberId();
    if (!memberId) return null;
    return this.activeMemberOptions().find(m => m.id === memberId)?.displayName || null;
  });

  // Computed: all available tag names
  availableTagNames = computed<string[]>(() => {
    const tagSet = new Set<string>();
    this.topics().forEach(topic => {
      topic.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  });

  // Computed: topics for selected member
  memberTopics = computed<TopicWithRoles[]>(() => {
    const memberId = this._selectedMemberId();
    if (!memberId) return [];

    const topics = this.topics();
    const result: TopicWithRoles[] = [];

    topics.forEach(topic => {
      const roles: string[] = [];

      // Check R1, R2, R3
      if (topic.raci.r1MemberId === memberId) roles.push('R1');
      if (topic.raci.r2MemberId === memberId) roles.push('R2');
      if (topic.raci.r3MemberId === memberId) roles.push('R3');
      
      // Check C (Consulted)
      if (topic.raci.cMemberIds.includes(memberId)) roles.push('C');
      
      // Check I (Informed)
      if (topic.raci.iMemberIds.includes(memberId)) roles.push('I');

      if (roles.length > 0) {
        result.push({ topic, roles });
      }
    });

    return result;
  });

  // Computed: filtered topics with all filters applied
  filteredTopics = computed<TopicWithRoles[]>(() => {
    let result = this.memberTopics();
    const allTagsMap = new Map(this.allTags().map(t => [t.name, t]));

    // Filter by roles
    const filterRoles = this._filterRoles();
    if (filterRoles.length > 0) {
      result = result.filter(item => 
        item.roles.some(role => filterRoles.includes(role))
      );
    }

    // Filter by tags
    const filterTags = this._filterTags();
    if (filterTags.length > 0) {
      result = result.filter(item => 
        item.topic.tags?.some(tag => filterTags.includes(tag)) ?? false
      );
    }

    // Filter by super-tag
    if (this._filterSuperTagOnly()) {
      result = result.filter(item => 
        item.topic.tags?.some(tagName => {
          const tag = allTagsMap.get(tagName);
          return tag?.isSuperTag === true;
        }) ?? false
      );
    }

    // Filter by GVPL tag
    if (this._filterGvplTagOnly()) {
      result = result.filter(item => 
        item.topic.tags?.some(tagName => {
          const tag = allTagsMap.get(tagName);
          return tag?.isGvplTag === true;
        }) ?? false
      );
    }

    // Filter by priority range
    const minPriority = this._filterPriorityMin();
    const maxPriority = this._filterPriorityMax();
    if (minPriority !== null) {
      result = result.filter(item => (item.topic.priority ?? 0) >= minPriority);
    }
    if (maxPriority !== null) {
      result = result.filter(item => (item.topic.priority ?? 0) <= maxPriority);
    }

    // Filter by sizes
    const filterSizes = this._filterSizes();
    if (filterSizes.length > 0) {
      result = result.filter(item => 
        item.topic.size && filterSizes.includes(item.topic.size)
      );
    }

    // Filter by validity
    const filterValidity = this._filterValidity();
    if (filterValidity.length > 0) {
      result = result.filter(item => {
        const validityStatus = this.getValidityStatus(item.topic);
        return filterValidity.includes(validityStatus);
      });
    }

    return result;
  });

  // Options for filters
  roleOptions = [
    { label: 'R1 - Hauptverantwortlich', value: 'R1' },
    { label: 'R2 - Stellvertretung', value: 'R2' },
    { label: 'R3 - Weitere Stellvertretung', value: 'R3' },
    { label: 'C - Consulted', value: 'C' },
    { label: 'I - Informed', value: 'I' }
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

  validityOptions = [
    { label: 'Gültig', value: 'valid' },
    { label: 'Immer gültig', value: 'always' },
    { label: 'Zukünftig', value: 'future' },
    { label: 'Abgelaufen', value: 'expired' }
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

  private subscriptions: Subscription[] = [];

  constructor(private backend: BackendService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected.set(connected);
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
    this.members.set(datastore.members);
    this.topics.set(datastore.topics);
    this.allTags.set(datastore.tags || []);
  }

  clearFilters(): void {
    this._filterRoles.set([]);
    this._filterTags.set([]);
    this._filterSuperTagOnly.set(false);
    this._filterGvplTagOnly.set(false);
    this._filterPriorityMin.set(null);
    this._filterPriorityMax.set(null);
    this._filterSizes.set([]);
    this._filterValidity.set([]);
  }

  toggleSuperTagFilter(): void {
    this._filterSuperTagOnly.set(!this._filterSuperTagOnly());
  }

  toggleGvplTagFilter(): void {
    this._filterGvplTagOnly.set(!this._filterGvplTagOnly());
  }

  getRoleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (role) {
      case 'R1':
        return 'success';
      case 'R2':
        return 'info';
      case 'R3':
        return 'secondary';
      case 'C':
        return 'warn';
      case 'I':
        return 'contrast';
      default:
        return 'secondary';
    }
  }

  getRoleTooltip(role: string): string {
    switch (role) {
      case 'R1':
        return 'Hauptverantwortlich';
      case 'R2':
        return 'Stellvertretung';
      case 'R3':
        return 'Weitere Stellvertretung';
      case 'C':
        return 'Consulted (wird konsultiert)';
      case 'I':
        return 'Informed (wird informiert)';
      default:
        return '';
    }
  }

  getSizeSeverity(size: TShirtSize | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return getSizeSeverity(size);
  }

  getValidityStatus(topic: Topic): string {
    if (topic.validity.alwaysValid) return 'always';

    const now = new Date();
    const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;

    if (validFrom && now < validFrom) return 'future';
    if (validTo && now > validTo) return 'expired';
    
    return 'valid';
  }

  getValidityLabel(topic: Topic): string {
    const status = this.getValidityStatus(topic);
    switch (status) {
      case 'always':
        return 'Immer gültig';
      case 'future':
        return 'Zukünftig';
      case 'expired':
        return 'Abgelaufen';
      default:
        return 'Gültig';
    }
  }

  getValiditySeverity(topic: Topic): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const status = this.getValidityStatus(topic);
    switch (status) {
      case 'always':
        return 'success';
      case 'future':
        return 'info';
      case 'expired':
        return 'danger';
      default:
        return 'success';
    }
  }

  truncateDescription(description: string | undefined, maxLength: number = 100): string {
    if (!description) return '';
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength) + '...';
  }

  trackByTopicId(_index: number, item: TopicWithRoles): string {
    return item.topic.id;
  }

  printTopics(): void {
    window.print();
  }
}
