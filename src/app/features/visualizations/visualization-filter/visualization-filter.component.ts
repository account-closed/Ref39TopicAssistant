import { Component, ChangeDetectionStrategy, inject, computed, output, signal, effect, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MultiSelect } from 'primeng/multiselect';
import { BackendService } from '../../../core/services/backend.service';
import { Tag, TeamMember, TShirtSize, Topic } from '../../../core/models';

export interface VisualizationFilters {
  selectedTagIds: string[];
  selectedMemberIds: string[];
  selectedSizes: TShirtSize[];
  selectedPriorities: number[];
}

@Component({
  selector: 'app-visualization-filter',
  imports: [FormsModule, MultiSelect],
  template: `
    <div class="visualization-filters">
      <div class="filter-group">
        <label for="tagFilter">Tags</label>
        <p-multiselect
          id="tagFilter"
          [options]="tagOptions()"
          [(ngModel)]="selectedTagIds"
          optionLabel="label"
          optionValue="value"
          placeholder="Alle Tags"
          [showClear]="true"
          [filter]="true"
          filterPlaceholder="Tag suchen..."
          (onChange)="emitFilters()"
          styleClass="w-full"
        ></p-multiselect>
      </div>
      
      <div class="filter-group">
        <label for="memberFilter">Teammitglieder</label>
        <p-multiselect
          id="memberFilter"
          [options]="memberOptions()"
          [(ngModel)]="selectedMemberIds"
          optionLabel="label"
          optionValue="value"
          placeholder="Alle Mitglieder"
          [showClear]="true"
          [filter]="true"
          filterPlaceholder="Mitglied suchen..."
          (onChange)="emitFilters()"
          styleClass="w-full"
        ></p-multiselect>
      </div>
      
      <div class="filter-group">
        <label for="sizeFilter">Größe</label>
        <p-multiselect
          id="sizeFilter"
          [options]="sizeOptions"
          [(ngModel)]="selectedSizes"
          optionLabel="label"
          optionValue="value"
          placeholder="Alle Größen"
          [showClear]="true"
          (onChange)="emitFilters()"
          styleClass="w-full"
        ></p-multiselect>
      </div>
      
      <div class="filter-group">
        <label for="priorityFilter">Priorität</label>
        <p-multiselect
          id="priorityFilter"
          [options]="priorityOptions"
          [(ngModel)]="selectedPriorities"
          optionLabel="label"
          optionValue="value"
          placeholder="Alle Prioritäten"
          [showClear]="true"
          (onChange)="emitFilters()"
          styleClass="w-full"
        ></p-multiselect>
      </div>
    </div>
  `,
  styles: [`
    .visualization-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem;
      background: var(--p-surface-50);
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 200px;
      flex: 1;
    }
    
    .filter-group label {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--p-text-color);
    }
    
    :host ::ng-deep .w-full {
      width: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VisualizationFilterComponent {
  private readonly backend = inject(BackendService);
  
  readonly initialFilters = input<VisualizationFilters | undefined>();
  readonly filtersChange = output<VisualizationFilters>();
  readonly filteredTopics = output<Topic[]>();
  
  private readonly datastore = toSignal(this.backend.datastore$);
  
  selectedTagIds: string[] = [];
  selectedMemberIds: string[] = [];
  selectedSizes: TShirtSize[] = [];
  selectedPriorities: number[] = [];
  
  readonly tagOptions = computed(() => {
    const ds = this.datastore();
    if (!ds?.tags) return [];
    return ds.tags.map(tag => ({
      label: tag.name,
      value: tag.id
    }));
  });
  
  readonly memberOptions = computed(() => {
    const ds = this.datastore();
    if (!ds?.members) return [];
    return ds.members
      .filter(m => m.active)
      .map(member => ({
        label: member.displayName,
        value: member.id
      }));
  });
  
  readonly sizeOptions: { label: string; value: TShirtSize }[] = [
    { label: 'XXS', value: 'XXS' },
    { label: 'XS', value: 'XS' },
    { label: 'S', value: 'S' },
    { label: 'M', value: 'M' },
    { label: 'L', value: 'L' },
    { label: 'XL', value: 'XL' },
    { label: 'XXL', value: 'XXL' }
  ];
  
  readonly priorityOptions: { label: string; value: number }[] = Array.from(
    { length: 10 },
    (_, i) => ({ label: `${i + 1} ★`, value: i + 1 })
  );
  
  constructor() {
    effect(() => {
      const init = this.initialFilters();
      if (init) {
        this.selectedTagIds = [...init.selectedTagIds];
        this.selectedMemberIds = [...init.selectedMemberIds];
        this.selectedSizes = [...init.selectedSizes];
        this.selectedPriorities = [...init.selectedPriorities];
      }
    });
  }
  
  emitFilters(): void {
    const filters: VisualizationFilters = {
      selectedTagIds: this.selectedTagIds,
      selectedMemberIds: this.selectedMemberIds,
      selectedSizes: this.selectedSizes,
      selectedPriorities: this.selectedPriorities
    };
    this.filtersChange.emit(filters);
    
    const ds = this.datastore();
    if (!ds?.topics) {
      this.filteredTopics.emit([]);
      return;
    }
    
    let topics = [...ds.topics];
    
    if (this.selectedTagIds.length > 0) {
      // Create a set of selected tag names for matching
      const selectedTagNames = new Set<string>();
      this.selectedTagIds.forEach(tagId => {
        const tag = ds.tags?.find(t => t.id === tagId);
        if (tag) {
          selectedTagNames.add(tag.name);
          selectedTagNames.add(tag.id);
        }
      });
      
      topics = topics.filter(t => 
        t.tags?.some(tagRef => 
          this.selectedTagIds.includes(tagRef) || selectedTagNames.has(tagRef)
        )
      );
    }
    
    if (this.selectedMemberIds.length > 0) {
      topics = topics.filter(t => {
        const memberIds = [
          t.raci.r1MemberId,
          t.raci.r2MemberId,
          t.raci.r3MemberId,
          ...(t.raci.cMemberIds || []),
          ...(t.raci.iMemberIds || [])
        ].filter(Boolean);
        return memberIds.some(id => this.selectedMemberIds.includes(id as string));
      });
    }
    
    if (this.selectedSizes.length > 0) {
      topics = topics.filter(t => t.size && this.selectedSizes.includes(t.size));
    }
    
    if (this.selectedPriorities.length > 0) {
      topics = topics.filter(t => t.priority && this.selectedPriorities.includes(t.priority));
    }
    
    this.filteredTopics.emit(topics);
  }
}
