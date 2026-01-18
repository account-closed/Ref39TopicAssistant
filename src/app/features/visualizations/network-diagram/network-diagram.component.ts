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
import { Topic, TShirtSize, Datastore, TopicConnectionType } from '../../../core/models';
import {
  VisualizationFilterComponent,
} from '../visualization-filter/visualization-filter.component';

interface NetworkNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: 'topic' | 'tag' | 'member';
  size?: TShirtSize;
  priority?: number;
  color?: string;
  radius: number;
  topic?: Topic;
}

interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
  source: NetworkNode | string;
  target: NetworkNode | string;
  type: TopicConnectionType | 'hasTag' | 'hasMember';
}

@Component({
  selector: 'app-network-diagram',
  imports: [Card, Button, Tag, SelectButton, FormsModule, VisualizationFilterComponent],
  template: `
    <div class="page-container">
      <p-card>
        <ng-template #header>
          <div class="card-header">
            <h2>
              <i class="pi pi-share-alt"></i>
              Netzwerk Diagramm
            </h2>
            <p class="subtitle">Interaktive Netzwerkansicht aller Themen mit Abhängigkeiten und Beziehungen</p>
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
            (onClick)="resetSimulation()"
            size="small"
          ></p-button>
          
          <div class="view-options">
            <label>Anzeigen:</label>
            <p-selectbutton
              [options]="viewOptions"
              [(ngModel)]="selectedView"
              (onChange)="onViewChange()"
              optionLabel="label"
              optionValue="value"
            ></p-selectbutton>
          </div>
          
          <span class="topic-count">{{ filteredTopics().length }} Themen</span>
        </div>
        
        <div class="network-container" #networkContainer>
          <svg #networkSvg></svg>
        </div>
        
        @if (selectedNode()) {
          <div class="selected-node-info">
            @if (selectedNode()?.type === 'topic' && selectedNode()?.topic) {
              <h4>{{ selectedNode()?.topic?.header }}</h4>
              @if (selectedNode()?.topic?.description) {
                <p>{{ selectedNode()?.topic?.description }}</p>
              }
              <div class="node-meta">
                @if (selectedNode()?.topic?.priority) {
                  <p-tag
                    [value]="'Priorität: ' + selectedNode()?.topic?.priority"
                    severity="info"
                  ></p-tag>
                }
                @if (selectedNode()?.topic?.size) {
                  <p-tag
                    [value]="'Größe: ' + selectedNode()?.topic?.size"
                    [severity]="getSizeSeverity(selectedNode()?.topic?.size)"
                  ></p-tag>
                }
              </div>
              @if (getConnectedTopics().length > 0) {
                <div class="connected-topics">
                  <h5>Verbundene Themen:</h5>
                  <ul>
                    @for (conn of getConnectedTopics(); track conn.id) {
                      <li>
                        <span class="connection-type">{{ getConnectionTypeLabel(conn.type) }}:</span>
                        {{ conn.name }}
                      </li>
                    }
                  </ul>
                </div>
              }
            } @else {
              <h4>{{ selectedNode()?.name }}</h4>
              <p-tag [value]="selectedNode()?.type === 'tag' ? 'Tag' : 'Mitglied'"></p-tag>
            }
          </div>
        }
        
        <div class="legend">
          <h4>Legende</h4>
          <div class="legend-section">
            <h5>Knoten</h5>
            <div class="legend-items">
              <div class="legend-item">
                <span class="legend-circle" style="background: var(--p-primary-color)"></span>
                <span>Thema</span>
              </div>
              <div class="legend-item">
                <span class="legend-circle small" style="background: #8b5cf6"></span>
                <span>Tag</span>
              </div>
              <div class="legend-item">
                <span class="legend-circle small" style="background: #06b6d4"></span>
                <span>Mitglied</span>
              </div>
            </div>
          </div>
          <div class="legend-section">
            <h5>Verbindungen</h5>
            <div class="legend-items">
              <div class="legend-item">
                <span class="legend-line" style="background: #ef4444"></span>
                <span>Blockiert</span>
              </div>
              <div class="legend-item">
                <span class="legend-line" style="background: #f97316"></span>
                <span>Abhängig von</span>
              </div>
              <div class="legend-item">
                <span class="legend-line" style="background: #6366f1"></span>
                <span>Verwandt</span>
              </div>
              <div class="legend-item">
                <span class="legend-line dashed" style="background: #8b5cf6"></span>
                <span>Hat Tag</span>
              </div>
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
      
      .view-options {
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
    
    .network-container {
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
    
    .selected-node-info {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--p-surface-50);
      border-radius: 8px;
      border-left: 4px solid var(--p-primary-color);
      
      h4 {
        margin: 0 0 0.5rem 0;
        color: var(--p-text-color);
      }
      
      h5 {
        margin: 0.75rem 0 0.5rem 0;
        font-size: 0.875rem;
        color: var(--p-text-color);
      }
      
      p {
        margin: 0 0 0.5rem 0;
        color: var(--p-text-muted-color);
        font-size: 0.875rem;
      }
      
      .node-meta {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      
      .connected-topics {
        ul {
          margin: 0;
          padding-left: 1.25rem;
          
          li {
            margin-bottom: 0.25rem;
            font-size: 0.875rem;
            color: var(--p-text-muted-color);
            
            .connection-type {
              font-weight: 500;
              color: var(--p-text-color);
            }
          }
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
      }
      
      h5 {
        margin: 0 0 0.5rem 0;
        font-size: 0.75rem;
        color: var(--p-text-muted-color);
        text-transform: uppercase;
      }
      
      .legend-section {
        margin-bottom: 1rem;
        
        &:last-child {
          margin-bottom: 0;
        }
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
      
      .legend-circle {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        
        &.small {
          width: 12px;
          height: 12px;
        }
      }
      
      .legend-line {
        width: 24px;
        height: 3px;
        border-radius: 2px;
        
        &.dashed {
          background: repeating-linear-gradient(
            90deg,
            currentColor,
            currentColor 4px,
            transparent 4px,
            transparent 8px
          );
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NetworkDiagramComponent implements AfterViewInit, OnDestroy {
  private readonly backend = inject(BackendService);
  private readonly datastore = toSignal(this.backend.datastore$);
  
  private readonly networkContainer = viewChild<ElementRef<HTMLDivElement>>('networkContainer');
  private readonly networkSvg = viewChild<ElementRef<SVGSVGElement>>('networkSvg');
  
  protected readonly filteredTopics = signal<Topic[]>([]);
  protected readonly selectedNode = signal<NetworkNode | null>(null);
  
  protected readonly viewOptions = [
    { label: 'Nur Themen', value: 'topics' },
    { label: 'Mit Tags', value: 'tags' },
    { label: 'Alle', value: 'all' }
  ];
  protected selectedView = 'topics';
  
  private resizeObserver: ResizeObserver | null = null;
  private simulation: d3.Simulation<NetworkNode, NetworkLink> | null = null;
  
  constructor() {
    effect(() => {
      const topics = this.filteredTopics();
      const ds = this.datastore();
      if (ds && this.networkSvg()) {
        this.renderNetwork(topics, ds);
      }
    });
  }
  
  ngAfterViewInit(): void {
    const container = this.networkContainer();
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        const topics = this.filteredTopics();
        const ds = this.datastore();
        if (ds) {
          this.renderNetwork(topics, ds);
        }
      });
      this.resizeObserver.observe(container.nativeElement);
    }
    
    // Initial render
    const ds = this.datastore();
    if (ds) {
      this.filteredTopics.set(ds.topics);
      this.renderNetwork(ds.topics, ds);
    }
  }
  
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.simulation?.stop();
  }
  
  onFilteredTopics(topics: Topic[]): void {
    this.filteredTopics.set(topics);
  }
  
  onViewChange(): void {
    const topics = this.filteredTopics();
    const ds = this.datastore();
    if (ds) {
      this.renderNetwork(topics, ds);
    }
  }
  
  resetSimulation(): void {
    const topics = this.filteredTopics();
    const ds = this.datastore();
    if (ds) {
      this.renderNetwork(topics, ds);
    }
  }
  
  getConnectedTopics(): { id: string; name: string; type: TopicConnectionType }[] {
    const node = this.selectedNode();
    if (!node?.topic?.connections) return [];
    
    const ds = this.datastore();
    if (!ds) return [];
    
    return node.topic.connections.map(conn => {
      const targetTopic = ds.topics.find(t => t.id === conn.targetTopicId);
      return {
        id: conn.targetTopicId,
        name: targetTopic?.header || 'Unbekannt',
        type: conn.type
      };
    });
  }
  
  getConnectionTypeLabel(type: TopicConnectionType): string {
    switch (type) {
      case 'dependsOn':
        return 'Abhängig von';
      case 'blocks':
        return 'Blockiert';
      case 'relatedTo':
        return 'Verwandt mit';
      default:
        return type;
    }
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
  
  private getSizeRadius(size: TShirtSize | undefined): number {
    const sizeMap: Record<TShirtSize, number> = {
      'XXS': 8,
      'XS': 10,
      'S': 12,
      'M': 16,
      'L': 20,
      'XL': 24,
      'XXL': 30
    };
    return size ? sizeMap[size] : 12;
  }
  
  private getTopicColor(topic: Topic): string {
    const priority = topic.priority || 5;
    if (priority >= 8) return '#ef4444';
    if (priority >= 6) return '#f97316';
    if (priority >= 4) return '#eab308';
    return '#22c55e';
  }
  
  private getLinkColor(type: NetworkLink['type']): string {
    switch (type) {
      case 'blocks':
        return '#ef4444';
      case 'dependsOn':
        return '#f97316';
      case 'relatedTo':
        return '#6366f1';
      case 'hasTag':
        return '#8b5cf6';
      case 'hasMember':
        return '#06b6d4';
      default:
        return '#9ca3af';
    }
  }
  
  private buildNetworkData(topics: Topic[], ds: Datastore): { nodes: NetworkNode[]; links: NetworkLink[] } {
    const nodes: NetworkNode[] = [];
    const links: NetworkLink[] = [];
    const nodeMap = new Map<string, NetworkNode>();
    
    // Add topic nodes
    topics.forEach(topic => {
      const node: NetworkNode = {
        id: topic.id,
        name: topic.header,
        type: 'topic',
        size: topic.size,
        priority: topic.priority,
        color: this.getTopicColor(topic),
        radius: this.getSizeRadius(topic.size),
        topic
      };
      nodes.push(node);
      nodeMap.set(topic.id, node);
    });
    
    // Add connections between topics
    topics.forEach(topic => {
      if (topic.connections) {
        topic.connections.forEach(conn => {
          if (nodeMap.has(conn.targetTopicId)) {
            links.push({
              source: topic.id,
              target: conn.targetTopicId,
              type: conn.type
            });
          }
        });
      }
    });
    
    // Add tag nodes if selected
    if (this.selectedView === 'tags' || this.selectedView === 'all') {
      const tagRefs = new Set<string>();
      topics.forEach(topic => {
        topic.tags?.forEach(tagRef => tagRefs.add(tagRef));
      });
      
      tagRefs.forEach(tagRef => {
        // Tags in topics can be either IDs or names, so search by both
        const tag = ds.tags?.find(t => t.id === tagRef || t.name === tagRef);
        // Use the tag name if found, otherwise use the reference itself
        const tagName = tag?.name || tagRef;
        const tagId = tag?.id || tagRef;
        
        const node: NetworkNode = {
          id: tagId,
          name: tagName,
          type: 'tag',
          color: tag?.color || '#8b5cf6',
          radius: 8
        };
        nodes.push(node);
        nodeMap.set(tagRef, node);
        
        // Link topics to tags
        topics.forEach(topic => {
          if (topic.tags?.includes(tagRef)) {
            links.push({
              source: topic.id,
              target: tagId,
              type: 'hasTag'
            });
          }
        });
      });
    }
    
    // Add member nodes if "all" is selected
    if (this.selectedView === 'all') {
      const memberIds = new Set<string>();
      topics.forEach(topic => {
        if (topic.raci.r1MemberId) memberIds.add(topic.raci.r1MemberId);
        if (topic.raci.r2MemberId) memberIds.add(topic.raci.r2MemberId);
        if (topic.raci.r3MemberId) memberIds.add(topic.raci.r3MemberId);
      });
      
      memberIds.forEach(memberId => {
        const member = ds.members?.find(m => m.id === memberId);
        if (member) {
          const node: NetworkNode = {
            id: memberId,
            name: member.displayName,
            type: 'member',
            color: member.color || '#06b6d4',
            radius: 10
          };
          nodes.push(node);
          nodeMap.set(memberId, node);
          
          // Link topics to responsible members
          topics.forEach(topic => {
            const isResponsible = 
              topic.raci.r1MemberId === memberId ||
              topic.raci.r2MemberId === memberId ||
              topic.raci.r3MemberId === memberId;
            
            if (isResponsible) {
              links.push({
                source: topic.id,
                target: memberId,
                type: 'hasMember'
              });
            }
          });
        }
      });
    }
    
    return { nodes, links };
  }
  
  private renderNetwork(topics: Topic[], ds: Datastore): void {
    const svgElement = this.networkSvg();
    const containerElement = this.networkContainer();
    if (!svgElement || !containerElement) return;
    
    this.simulation?.stop();
    
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
    
    const { nodes, links } = this.buildNetworkData(topics, ds);
    
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    
    // Create arrow markers for directed links
    const defs = svg.append('defs');
    
    ['blocks', 'dependsOn', 'relatedTo'].forEach(type => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', this.getLinkColor(type as TopicConnectionType))
        .attr('d', 'M0,-5L10,0L0,5');
    });
    
    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    const g = svg.append('g');
    
    // Create simulation
    this.simulation = d3.forceSimulation<NetworkNode>(nodes)
      .force('link', d3.forceLink<NetworkNode, NetworkLink>(links)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<NetworkNode>().radius(d => d.radius + 10));
    
    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => this.getLinkColor(d.type))
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => d.type === 'hasTag' || d.type === 'hasMember' ? 1 : 2)
      .attr('stroke-dasharray', d => d.type === 'hasTag' || d.type === 'hasMember' ? '4,4' : 'none')
      .attr('marker-end', d => {
        if (d.type === 'blocks' || d.type === 'dependsOn' || d.type === 'relatedTo') {
          return `url(#arrow-${d.type})`;
        }
        return null;
      });
    
    // Draw nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, NetworkNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color || 'var(--p-primary-color)')
      .attr('stroke', 'var(--p-surface-0)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(this.drag(this.simulation));
    
    node.on('click', (event, d) => {
      this.selectedNode.set(d);
      
      // Highlight connected nodes
      node.attr('opacity', n => {
        if (n.id === d.id) return 1;
        const isConnected = links.some(l => 
          (typeof l.source === 'object' ? l.source.id : l.source) === d.id && 
          (typeof l.target === 'object' ? l.target.id : l.target) === n.id ||
          (typeof l.target === 'object' ? l.target.id : l.target) === d.id && 
          (typeof l.source === 'object' ? l.source.id : l.source) === n.id
        );
        return isConnected ? 1 : 0.3;
      });
      
      link.attr('opacity', l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return sourceId === d.id || targetId === d.id ? 1 : 0.1;
      });
    });
    
    node.on('dblclick', () => {
      this.selectedNode.set(null);
      node.attr('opacity', 1);
      link.attr('opacity', 0.6);
    });
    
    // Add labels
    const label = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => {
        const maxLength = 20;
        return d.name.length > maxLength ? d.name.substring(0, maxLength) + '...' : d.name;
      })
      .attr('font-size', d => d.type === 'topic' ? '10px' : '8px')
      .attr('fill', 'var(--p-text-color)')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 12)
      .style('pointer-events', 'none');
    
    // Add tooltips
    node.append('title')
      .text(d => {
        if (d.type === 'topic' && d.topic) {
          return `${d.name}\nGröße: ${d.topic.size || 'Keine'}\nPriorität: ${d.topic.priority || 'Keine'}`;
        }
        return d.name;
      });
    
    // Update positions on tick
    this.simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NetworkNode).x || 0)
        .attr('y1', d => (d.source as NetworkNode).y || 0)
        .attr('x2', d => (d.target as NetworkNode).x || 0)
        .attr('y2', d => (d.target as NetworkNode).y || 0);
      
      node
        .attr('cx', d => d.x || 0)
        .attr('cy', d => d.y || 0);
      
      label
        .attr('x', d => d.x || 0)
        .attr('y', d => d.y || 0);
    });
  }
  
  private drag(simulation: d3.Simulation<NetworkNode, NetworkLink>): d3.DragBehavior<SVGCircleElement, NetworkNode, NetworkNode | d3.SubjectPosition> {
    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, NetworkNode, NetworkNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event: d3.D3DragEvent<SVGCircleElement, NetworkNode, NetworkNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event: d3.D3DragEvent<SVGCircleElement, NetworkNode, NetworkNode>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    
    return d3.drag<SVGCircleElement, NetworkNode>()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }
}
