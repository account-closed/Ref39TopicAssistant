import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
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
import * as d3 from 'd3';
import { BackendService } from '../../../core/services/backend.service';
import { Topic, TShirtSize, Datastore } from '../../../core/models';
import {
  VisualizationFilterComponent,
} from '../visualization-filter/visualization-filter.component';

interface SunburstNode {
  name: string;
  value?: number;
  children?: SunburstNode[];
  data?: {
    topic?: Topic;
    type: 'root' | 'tag' | 'topic';
    tagId?: string;
    color?: string;
    priority?: number;
  };
}

interface HierarchyDatum extends d3.HierarchyRectangularNode<SunburstNode> {
  current?: { x0: number; x1: number; y0: number; y1: number };
  target?: { x0: number; x1: number; y0: number; y1: number };
}

@Component({
  selector: 'app-sunburst',
  imports: [Card, Button, Tag, VisualizationFilterComponent],
  template: `
    <div class="page-container">
      <p-card>
        <ng-template #header>
          <div class="card-header">
            <h2>
              <i class="pi pi-sun"></i>
              Sunburst Diagramm
            </h2>
            <p class="subtitle">Hierarchische Ansicht der Themen nach Tags mit Größe und Priorität</p>
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
            (onClick)="resetZoom()"
            size="small"
          ></p-button>
          <span class="topic-count">{{ filteredTopics().length }} Themen</span>
        </div>
        
        <div class="sunburst-container" #sunburstContainer>
          <svg #sunburstSvg></svg>
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
          </div>
        }
        
        <div class="legend">
          <h4>Legende</h4>
          <div class="legend-items">
            <div class="legend-item">
              <span class="legend-color" style="background: var(--p-primary-color)"></span>
              <span>Tags</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #22c55e"></span>
              <span>Klein (XXS-S)</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #eab308"></span>
              <span>Mittel (M)</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #f97316"></span>
              <span>Groß (L-XL)</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #ef4444"></span>
              <span>Sehr Groß (XXL)</span>
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
      
      .topic-count {
        color: var(--p-text-muted-color);
        font-size: 0.875rem;
      }
    }
    
    .sunburst-container {
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
      }
      
      .legend-items {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
      }
      
      .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--p-text-muted-color);
      }
      
      .legend-color {
        width: 16px;
        height: 16px;
        border-radius: 4px;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SunburstComponent implements AfterViewInit, OnDestroy {
  private readonly backend = inject(BackendService);
  private readonly datastore = toSignal(this.backend.datastore$);
  
  private readonly sunburstContainer = viewChild<ElementRef<HTMLDivElement>>('sunburstContainer');
  private readonly sunburstSvg = viewChild<ElementRef<SVGSVGElement>>('sunburstSvg');
  
  protected readonly filteredTopics = signal<Topic[]>([]);
  protected readonly selectedTopic = signal<Topic | null>(null);
  
  private resizeObserver: ResizeObserver | null = null;
  private currentRoot: HierarchyDatum | null = null;
  
  constructor() {
    effect(() => {
      const topics = this.filteredTopics();
      const ds = this.datastore();
      if (ds && this.sunburstSvg()) {
        this.renderSunburst(topics, ds);
      }
    });
  }
  
  ngAfterViewInit(): void {
    const container = this.sunburstContainer();
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        const topics = this.filteredTopics();
        const ds = this.datastore();
        if (ds) {
          this.renderSunburst(topics, ds);
        }
      });
      this.resizeObserver.observe(container.nativeElement);
    }
    
    // Initial render
    const ds = this.datastore();
    if (ds) {
      this.filteredTopics.set(ds.topics);
      this.renderSunburst(ds.topics, ds);
    }
  }
  
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }
  
  onFilteredTopics(topics: Topic[]): void {
    this.filteredTopics.set(topics);
  }
  
  resetZoom(): void {
    const ds = this.datastore();
    if (ds && this.currentRoot) {
      this.zoomToNode(this.currentRoot);
    }
  }
  
  getSelectedTopicTags(): { id: string; name: string; color?: string }[] {
    const topic = this.selectedTopic();
    const ds = this.datastore();
    if (!topic?.tags || !ds?.tags) return [];
    
    return ds.tags.filter(tag => topic.tags?.includes(tag.id));
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
  
  private getTopicColor(topic: Topic): string {
    const size = topic.size;
    if (!size) return '#6366f1';
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
  
  private buildHierarchy(topics: Topic[], ds: Datastore): SunburstNode {
    const tagMap = new Map<string, SunburstNode>();
    const rootChildren: SunburstNode[] = [];
    
    // Group topics by their first tag
    topics.forEach(topic => {
      const tagIds = topic.tags || [];
      
      if (tagIds.length === 0) {
        // Topics without tags go to "Ohne Tag"
        let noTagNode = tagMap.get('no-tag');
        if (!noTagNode) {
          noTagNode = {
            name: 'Ohne Tag',
            children: [],
            data: { type: 'tag', tagId: 'no-tag', color: '#9ca3af' }
          };
          tagMap.set('no-tag', noTagNode);
          rootChildren.push(noTagNode);
        }
        noTagNode.children!.push({
          name: topic.header,
          value: this.getSizeValue(topic.size),
          data: {
            type: 'topic',
            topic,
            color: this.getTopicColor(topic),
            priority: topic.priority
          }
        });
      } else {
        // Add topic to each of its tags
        tagIds.forEach(tagId => {
          let tagNode = tagMap.get(tagId);
          if (!tagNode) {
            const tag = ds.tags?.find(t => t.id === tagId);
            tagNode = {
              name: tag?.name || 'Unbekannt',
              children: [],
              data: { type: 'tag', tagId, color: tag?.color || '#6366f1' }
            };
            tagMap.set(tagId, tagNode);
            rootChildren.push(tagNode);
          }
          tagNode.children!.push({
            name: topic.header,
            value: this.getSizeValue(topic.size),
            data: {
              type: 'topic',
              topic,
              color: this.getTopicColor(topic),
              priority: topic.priority
            }
          });
        });
      }
    });
    
    return {
      name: 'Themen',
      children: rootChildren,
      data: { type: 'root' }
    };
  }
  
  private renderSunburst(topics: Topic[], ds: Datastore): void {
    const svgElement = this.sunburstSvg();
    const containerElement = this.sunburstContainer();
    if (!svgElement || !containerElement) return;
    
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
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 600;
    const radius = Math.min(width, height) / 2;
    
    const hierarchy = d3.hierarchy(this.buildHierarchy(topics, ds))
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    const root = d3.partition<SunburstNode>()
      .size([2 * Math.PI, radius])
      (hierarchy) as HierarchyDatum;
    
    this.currentRoot = root;
    
    root.each(d => {
      (d as HierarchyDatum).current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 };
    });
    
    const g = svg
      .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
      .append('g');
    
    const arc = d3.arc<HierarchyDatum>()
      .startAngle(d => d.current!.x0)
      .endAngle(d => d.current!.x1)
      .padAngle(d => Math.min((d.current!.x1 - d.current!.x0) / 2, 0.005))
      .padRadius(radius / 2)
      .innerRadius(d => d.current!.y0)
      .outerRadius(d => d.current!.y1 - 1);
    
    const path = g.selectAll('path')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('path')
      .attr('fill', d => {
        if (d.data.data?.color) return d.data.data.color;
        if (d.data.data?.type === 'tag') return 'var(--p-primary-color)';
        return '#6366f1';
      })
      .attr('fill-opacity', d => {
        if (d.data.data?.type === 'topic') {
          const priority = d.data.data.priority || 5;
          return 0.5 + (priority / 20);
        }
        return 0.8;
      })
      .attr('d', arc as unknown as string)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (d.data.data?.type === 'topic' && d.data.data.topic) {
          this.selectedTopic.set(d.data.data.topic);
        } else if (d.children) {
          this.zoomToNode(d);
        }
      })
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget)
          .attr('fill-opacity', 1)
          .attr('stroke', 'var(--p-surface-0)')
          .attr('stroke-width', 2);
      })
      .on('mouseleave', (event, d) => {
        d3.select(event.currentTarget)
          .attr('fill-opacity', d.data.data?.type === 'topic' 
            ? 0.5 + ((d.data.data?.priority || 5) / 20)
            : 0.8)
          .attr('stroke', 'none');
      });
    
    path.append('title')
      .text(d => {
        const ancestors = d.ancestors().map(a => a.data.name).reverse();
        ancestors.shift(); // Remove root
        const path = ancestors.join(' → ');
        if (d.data.data?.type === 'topic' && d.data.data.topic) {
          const topic = d.data.data.topic;
          return `${path}\nGröße: ${topic.size || 'Keine'}\nPriorität: ${topic.priority || 'Keine'}`;
        }
        return path;
      });
    
    // Add labels
    const label = g.selectAll('text')
      .data(root.descendants().filter(d => d.depth > 0 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03))
      .join('text')
      .attr('transform', d => {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--p-surface-0)')
      .attr('font-size', '10px')
      .attr('pointer-events', 'none')
      .text(d => {
        const name = d.data.name;
        const maxLength = 15;
        return name.length > maxLength ? name.substring(0, maxLength) + '...' : name;
      });
    
    // Center circle for navigation
    g.append('circle')
      .attr('r', radius / 5)
      .attr('fill', 'var(--p-surface-50)')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', () => this.zoomToNode(root));
    
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', 'var(--p-text-color)')
      .attr('font-weight', '600')
      .style('pointer-events', 'none')
      .text('Themen');
  }
  
  private zoomToNode(p: HierarchyDatum): void {
    const svgElement = this.sunburstSvg();
    const containerElement = this.sunburstContainer();
    if (!svgElement || !containerElement) return;
    
    const container = containerElement.nativeElement;
    const radius = Math.min(container.clientWidth, container.clientHeight) / 2;
    
    const root = this.currentRoot;
    if (!root) return;
    
    root.each(d => {
      (d as HierarchyDatum).target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.y0),
        y1: Math.max(0, d.y1 - p.y0)
      };
    });
    
    const svg = d3.select(svgElement.nativeElement);
    
    const arc = d3.arc<HierarchyDatum>()
      .startAngle(d => d.current!.x0)
      .endAngle(d => d.current!.x1)
      .padAngle(d => Math.min((d.current!.x1 - d.current!.x0) / 2, 0.005))
      .padRadius(radius / 2)
      .innerRadius(d => d.current!.y0)
      .outerRadius(d => d.current!.y1 - 1);
    
    svg.selectAll<SVGPathElement, HierarchyDatum>('path')
      .transition()
      .duration(750)
      .tween('data', (d) => {
        const i = d3.interpolate(d.current!, d.target!);
        return (t: number) => {
          d.current = i(t);
        };
      })
      .attrTween('d', (d) => () => arc(d) || '');
  }
}
