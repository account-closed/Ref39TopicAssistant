import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  ElementRef,
  viewChild,
  effect,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { SelectButton } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';
import { BackendService } from '../../../core/services/backend.service';
import { Topic, TShirtSize, Datastore } from '../../../core/models';
import {
  VisualizationFilterComponent,
} from '../visualization-filter/visualization-filter.component';

interface TreemapNode {
  name: string;
  value?: number;
  children?: TreemapNode[];
  data?: {
    topic?: Topic;
    type: 'root' | 'group' | 'topic';
    groupId?: string;
    color?: string;
    priority?: number;
  };
}

type ClusteringType = 'tag' | 'member' | 'size' | 'priority';

@Component({
  selector: 'app-treemap',
  imports: [Card, Button, Tag, SelectButton, FormsModule, VisualizationFilterComponent],
  template: `
    <div class="page-container">
      <p-card>
        <ng-template #header>
          <div class="card-header">
            <h2>
              <i class="pi pi-th-large"></i>
              Treemap
            </h2>
            <p class="subtitle">Flächenbasierte Darstellung der Themen nach Größe und Priorität</p>
          </div>
        </ng-template>
        
        <app-visualization-filter
          (filteredTopics)="onFilteredTopics($event)"
        ></app-visualization-filter>
        
        <div class="visualization-controls">
          <p-button
            label="Zurücksetzen"
            icon="pi pi-refresh"
            [outlined]="true"
            (onClick)="resetView()"
            size="small"
          ></p-button>
          
          <div class="clustering-options">
            <label>Gruppierung:</label>
            <p-selectbutton
              [options]="clusteringOptions"
              [(ngModel)]="selectedClustering"
              (onChange)="onClusteringChange()"
              optionLabel="label"
              optionValue="value"
            ></p-selectbutton>
          </div>
          
          <span class="topic-count">{{ filteredTopics().length }} Themen</span>
        </div>
        
        <div class="treemap-container" #treemapContainer>
          <svg #treemapSvg></svg>
        </div>
        
        @if (selectedTopic()) {
          <div class="selected-topic-info">
            <h4>{{ selectedTopic()?.header }}</h4>
            @if (selectedTopic()?.description) {
              <p>{{ selectedTopic()?.description }}</p>
            }
            <div class="topic-meta">
              @if (selectedTopic()?.priority) {
                <p-tag
                  [value]="'Priorität: ' + selectedTopic()?.priority"
                  severity="info"
                ></p-tag>
              }
              @if (selectedTopic()?.size) {
                <p-tag
                  [value]="'Größe: ' + selectedTopic()?.size"
                  [severity]="getSizeSeverity(selectedTopic()?.size)"
                ></p-tag>
              }
            </div>
            @if (getSelectedTopicTags().length > 0) {
              <div class="topic-tags">
                @for (tag of getSelectedTopicTags(); track tag.id) {
                  <p-tag [value]="tag.name" [style]="{'background-color': tag.color || '#6366f1'}"></p-tag>
                }
              </div>
            }
            @if (getResponsibleMember()) {
              <div class="responsible-member">
                <span class="label">Verantwortlich:</span>
                <span>{{ getResponsibleMember() }}</span>
              </div>
            }
          </div>
        }
        
        <div class="legend">
          <h4>Legende - Priorität (Farbintensität)</h4>
          <div class="legend-gradient">
            <div class="gradient-bar"></div>
            <div class="gradient-labels">
              <span>Niedrig (1)</span>
              <span>Mittel (5)</span>
              <span>Hoch (10)</span>
            </div>
          </div>
          <h4>Legende - Größe (Fläche)</h4>
          <div class="legend-items">
            <div class="legend-item">
              <span class="legend-box small"></span>
              <span>XXS - S</span>
            </div>
            <div class="legend-item">
              <span class="legend-box medium"></span>
              <span>M</span>
            </div>
            <div class="legend-item">
              <span class="legend-box large"></span>
              <span>L - XL</span>
            </div>
            <div class="legend-item">
              <span class="legend-box xlarge"></span>
              <span>XXL</span>
            </div>
          </div>
        </div>
      </p-card>
    </div>
  `,
  styles: [`
    .card-header {
      padding: 1.5rem;
      
      h2 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--p-text-color);
      }
      
      .subtitle {
        margin: 0.5rem 0 0 0;
        color: var(--p-text-muted-color);
        font-size: 0.875rem;
      }
    }
    
    .visualization-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      
      .clustering-options {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        
        label {
          font-weight: 500;
          font-size: 0.875rem;
          color: var(--p-text-color);
        }
      }
      
      .topic-count {
        color: var(--p-text-muted-color);
        font-size: 0.875rem;
        margin-left: auto;
      }
    }
    
    .treemap-container {
      width: 100%;
      height: 600px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: var(--p-surface-ground);
      border-radius: 8px;
      overflow: hidden;
      
      svg {
        width: 100%;
        height: 100%;
      }
    }
    
    .selected-topic-info {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--p-surface-50);
      border-radius: 8px;
      border-left: 4px solid var(--p-primary-color);
      
      h4 {
        margin: 0 0 0.5rem 0;
        color: var(--p-text-color);
      }
      
      p {
        margin: 0 0 0.5rem 0;
        color: var(--p-text-muted-color);
        font-size: 0.875rem;
      }
      
      .topic-meta {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 0.5rem;
      }
      
      .topic-tags {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
        margin-bottom: 0.5rem;
      }
      
      .responsible-member {
        font-size: 0.875rem;
        color: var(--p-text-muted-color);
        
        .label {
          font-weight: 500;
          color: var(--p-text-color);
          margin-right: 0.5rem;
        }
      }
    }
    
    .legend {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--p-surface-50);
      border-radius: 8px;
      
      h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.875rem;
        color: var(--p-text-color);
        
        &:not(:first-child) {
          margin-top: 1rem;
        }
      }
      
      .legend-gradient {
        .gradient-bar {
          height: 20px;
          border-radius: 4px;
          background: linear-gradient(90deg, #22c55e, #eab308, #f97316, #ef4444);
        }
        
        .gradient-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--p-text-muted-color);
          margin-top: 0.25rem;
        }
      }
      
      .legend-items {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
      }
      
      .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--p-text-muted-color);
      }
      
      .legend-box {
        background: var(--p-primary-color);
        border-radius: 4px;
        
        &.small {
          width: 16px;
          height: 16px;
        }
        
        &.medium {
          width: 24px;
          height: 24px;
        }
        
        &.large {
          width: 32px;
          height: 32px;
        }
        
        &.xlarge {
          width: 40px;
          height: 40px;
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TreemapComponent implements AfterViewInit, OnDestroy {
  private readonly backend = inject(BackendService);
  private readonly datastore = toSignal(this.backend.datastore$);
  
  private readonly treemapContainer = viewChild<ElementRef<HTMLDivElement>>('treemapContainer');
  private readonly treemapSvg = viewChild<ElementRef<SVGSVGElement>>('treemapSvg');
  
  protected readonly filteredTopics = signal<Topic[]>([]);
  protected readonly selectedTopic = signal<Topic | null>(null);
  
  protected readonly clusteringOptions: { label: string; value: ClusteringType }[] = [
    { label: 'Nach Tag', value: 'tag' },
    { label: 'Nach Mitglied', value: 'member' },
    { label: 'Nach Größe', value: 'size' },
    { label: 'Nach Priorität', value: 'priority' }
  ];
  protected selectedClustering: ClusteringType = 'tag';
  
  private resizeObserver: ResizeObserver | null = null;
  
  // Constants for minimum label dimensions
  private readonly MIN_LABEL_WIDTH = 40;
  private readonly MIN_LABEL_HEIGHT = 20;
  private readonly MIN_SIZE_LABEL_WIDTH = 50;
  private readonly MIN_SIZE_LABEL_HEIGHT = 35;
  
  constructor() {
    effect(() => {
      const topics = this.filteredTopics();
      const ds = this.datastore();
      if (ds && this.treemapSvg()) {
        this.renderTreemap(topics, ds);
      }
    });
  }
  
  ngAfterViewInit(): void {
    const container = this.treemapContainer();
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        const topics = this.filteredTopics();
        const ds = this.datastore();
        if (ds) {
          this.renderTreemap(topics, ds);
        }
      });
      this.resizeObserver.observe(container.nativeElement);
    }
    
    // Initial render
    const ds = this.datastore();
    if (ds) {
      this.filteredTopics.set(ds.topics);
      this.renderTreemap(ds.topics, ds);
    }
  }
  
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }
  
  onFilteredTopics(topics: Topic[]): void {
    this.filteredTopics.set(topics);
  }
  
  onClusteringChange(): void {
    const topics = this.filteredTopics();
    const ds = this.datastore();
    if (ds) {
      this.renderTreemap(topics, ds);
    }
  }
  
  resetView(): void {
    this.selectedTopic.set(null);
    const topics = this.filteredTopics();
    const ds = this.datastore();
    if (ds) {
      this.renderTreemap(topics, ds);
    }
  }
  
  getSelectedTopicTags(): { id: string; name: string; color?: string }[] {
    const topic = this.selectedTopic();
    const ds = this.datastore();
    if (!topic?.tags || !ds?.tags) return [];
    
    return ds.tags.filter(tag => topic.tags?.includes(tag.id));
  }
  
  getResponsibleMember(): string | null {
    const topic = this.selectedTopic();
    const ds = this.datastore();
    if (!topic || !ds) return null;
    
    const member = ds.members.find(m => m.id === topic.raci.r1MemberId);
    return member?.displayName || null;
  }
  
  getSizeSeverity(size: TShirtSize | undefined): 'success' | 'info' | 'warn' | 'danger' {
    if (!size) return 'info';
    switch (size) {
      case 'XXS':
      case 'XS':
      case 'S':
        return 'success';
      case 'M':
        return 'info';
      case 'L':
      case 'XL':
        return 'warn';
      case 'XXL':
        return 'danger';
      default:
        return 'info';
    }
  }
  
  private getSizeValue(size: TShirtSize | undefined): number {
    const sizeMap: Record<TShirtSize, number> = {
      'XXS': 1,
      'XS': 2,
      'S': 3,
      'M': 5,
      'L': 8,
      'XL': 13,
      'XXL': 21
    };
    return size ? sizeMap[size] : 3;
  }
  
  private getPriorityColor(priority: number | undefined): string {
    const p = priority || 5;
    if (p <= 3) return '#22c55e';
    if (p <= 5) return '#eab308';
    if (p <= 7) return '#f97316';
    return '#ef4444';
  }
  
  private getPriorityOpacity(priority: number | undefined): number {
    const p = priority || 5;
    return 0.4 + (p / 10) * 0.6;
  }
  
  private findTag(ds: Datastore, tagIdOrName: string) {
    // Tags in topics can be either IDs or names, so search by both
    return ds.tags?.find(t => t.id === tagIdOrName || t.name === tagIdOrName);
  }
  
  private buildHierarchy(topics: Topic[], ds: Datastore): TreemapNode {
    const groupMap = new Map<string, TreemapNode>();
    const rootChildren: TreemapNode[] = [];
    
    topics.forEach(topic => {
      let groupKeys: { id: string; name: string; color?: string }[] = [];
      
      switch (this.selectedClustering) {
        case 'tag':
          if (topic.tags && topic.tags.length > 0) {
            const firstTagRef = topic.tags[0];
            const tag = this.findTag(ds, firstTagRef);
            // Use the tag name if found, otherwise use the reference itself (it might be the name already)
            const tagName = tag?.name || firstTagRef;
            groupKeys = [{ 
              id: tag?.id || firstTagRef, 
              name: tagName,
              color: tag?.color 
            }];
          } else {
            groupKeys = [{ id: 'no-tag', name: 'Ohne Tag', color: '#9ca3af' }];
          }
          break;
          
        case 'member':
          const memberId = topic.raci.r1MemberId;
          if (memberId) {
            const member = ds.members.find(m => m.id === memberId);
            groupKeys = [{ 
              id: memberId, 
              name: member?.displayName || 'Unbekannt',
              color: member?.color 
            }];
          } else {
            groupKeys = [{ id: 'no-member', name: 'Kein Mitglied', color: '#9ca3af' }];
          }
          break;
          
        case 'size':
          const size = topic.size || 'M';
          groupKeys = [{ id: size, name: `Größe ${size}`, color: this.getSizeGroupColor(size) }];
          break;
          
        case 'priority':
          const priority = topic.priority || 5;
          const priorityGroup = this.getPriorityGroup(priority);
          groupKeys = [{ 
            id: priorityGroup.id, 
            name: priorityGroup.name, 
            color: priorityGroup.color 
          }];
          break;
      }
      
      groupKeys.forEach(groupKey => {
        let groupNode = groupMap.get(groupKey.id);
        if (!groupNode) {
          groupNode = {
            name: groupKey.name,
            children: [],
            data: { type: 'group', groupId: groupKey.id, color: groupKey.color || '#6366f1' }
          };
          groupMap.set(groupKey.id, groupNode);
          rootChildren.push(groupNode);
        }
        
        groupNode.children!.push({
          name: topic.header,
          value: this.getSizeValue(topic.size),
          data: {
            type: 'topic',
            topic,
            color: this.getPriorityColor(topic.priority),
            priority: topic.priority
          }
        });
      });
    });
    
    return {
      name: 'Themen',
      children: rootChildren,
      data: { type: 'root' }
    };
  }
  
  private getSizeGroupColor(size: TShirtSize): string {
    switch (size) {
      case 'XXS':
      case 'XS':
      case 'S':
        return '#22c55e';
      case 'M':
        return '#eab308';
      case 'L':
      case 'XL':
        return '#f97316';
      case 'XXL':
        return '#ef4444';
      default:
        return '#6366f1';
    }
  }
  
  private getPriorityGroup(priority: number): { id: string; name: string; color: string } {
    if (priority <= 3) {
      return { id: 'low', name: 'Niedrige Priorität (1-3)', color: '#22c55e' };
    } else if (priority <= 5) {
      return { id: 'medium', name: 'Mittlere Priorität (4-5)', color: '#eab308' };
    } else if (priority <= 7) {
      return { id: 'high', name: 'Hohe Priorität (6-7)', color: '#f97316' };
    } else {
      return { id: 'critical', name: 'Kritische Priorität (8-10)', color: '#ef4444' };
    }
  }
  
  private renderTreemap(topics: Topic[], ds: Datastore): void {
    const svgElement = this.treemapSvg();
    const containerElement = this.treemapContainer();
    if (!svgElement || !containerElement) return;
    
    // Capture constants for use in D3 callbacks
    const minLabelWidth = this.MIN_LABEL_WIDTH;
    const minLabelHeight = this.MIN_LABEL_HEIGHT;
    const minSizeLabelWidth = this.MIN_SIZE_LABEL_WIDTH;
    const minSizeLabelHeight = this.MIN_SIZE_LABEL_HEIGHT;
    
    const svg = d3.select(svgElement.nativeElement);
    svg.selectAll('*').remove();
    
    if (topics.length === 0) {
      svg.append('text')
        .attr('x', '50%')
        .attr('y', '50%')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--p-text-muted-color)')
        .text('Keine Themen zum Anzeigen');
      return;
    }
    
    const container = containerElement.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    
    const hierarchy = d3.hierarchy(this.buildHierarchy(topics, ds))
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    const treemap = d3.treemap<TreemapNode>()
      .size([width, height])
      .padding(2)
      .paddingTop(20)
      .round(true);
    
    const root = treemap(hierarchy);
    
    // Create group containers
    const groups = svg.selectAll('g.group')
      .data(root.children || [])
      .join('g')
      .attr('class', 'group');
    
    // Group background
    groups.append('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .attr('fill', d => d.data.data?.color || '#6366f1')
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => d.data.data?.color || '#6366f1')
      .attr('stroke-width', 2);
    
    // Group labels
    groups.append('text')
      .attr('x', d => d.x0 + 4)
      .attr('y', d => d.y0 + 14)
      .attr('fill', d => d.data.data?.color || 'var(--p-text-color)')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text(d => d.data.name);
    
    // Topic rectangles
    const leaves = svg.selectAll('g.leaf')
      .data(root.leaves())
      .join('g')
      .attr('class', 'leaf')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);
    
    leaves.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => d.data.data?.color || '#6366f1')
      .attr('fill-opacity', d => this.getPriorityOpacity(d.data.data?.priority))
      .attr('rx', 4)
      .attr('ry', 4)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (d.data.data?.topic) {
          this.selectedTopic.set(d.data.data.topic);
        }
      })
      .on('mouseenter', (event) => {
        d3.select(event.currentTarget)
          .attr('stroke', 'var(--p-surface-0)')
          .attr('stroke-width', 2);
      })
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .attr('stroke', 'none');
      });
    
    // Topic labels (only for larger cells)
    leaves.append('text')
      .attr('x', 4)
      .attr('y', 14)
      .attr('fill', 'var(--p-surface-0)')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .style('pointer-events', 'none')
      .each(function(d) {
        const self = d3.select(this);
        const availableWidth = d.x1 - d.x0 - 8;
        const availableHeight = d.y1 - d.y0 - 8;
        
        if (availableWidth < minLabelWidth || availableHeight < minLabelHeight) {
          self.text('');
          return;
        }
        
        const name = d.data.name;
        const maxChars = Math.floor(availableWidth / 6);
        self.text(name.length > maxChars ? name.substring(0, maxChars - 2) + '...' : name);
      });
    
    // Add size indicator for larger cells
    leaves.append('text')
      .attr('x', 4)
      .attr('y', d => Math.max(26, d.y1 - d.y0 - 6))
      .attr('fill', 'var(--p-surface-0)')
      .attr('fill-opacity', 0.7)
      .attr('font-size', '9px')
      .style('pointer-events', 'none')
      .each(function(d) {
        const self = d3.select(this);
        const availableWidth = d.x1 - d.x0 - 8;
        const availableHeight = d.y1 - d.y0 - 8;
        
        if (availableWidth < minSizeLabelWidth || availableHeight < minSizeLabelHeight) {
          self.text('');
          return;
        }
        
        const topic = d.data.data?.topic;
        if (topic) {
          const size = topic.size || '-';
          const priority = topic.priority || '-';
          self.text(`${size} | P${priority}`);
        }
      });
    
    // Tooltips
    leaves.append('title')
      .text(d => {
        const topic = d.data.data?.topic;
        if (topic) {
          return `${topic.header}\nGröße: ${topic.size || 'Keine'}\nPriorität: ${topic.priority || 'Keine'}`;
        }
        return d.data.name;
      });
  }
}
