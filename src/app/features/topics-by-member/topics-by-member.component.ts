import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { InputText } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { Topic, TeamMember, Datastore } from '../../core/models';

interface RaciCell {
  roles: string[]; // e.g., ['R1'], ['R2', 'C'], ['I']
}

interface MatrixRow {
  topic: Topic;
  isOrphan: boolean;
  cells: Map<string, RaciCell>;
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
    InputText,
    IconField,
    InputIcon
  ],
  templateUrl: './topics-by-member.component.html',
  styleUrl: './topics-by-member.component.scss'
})
export class TopicsByMemberComponent implements OnInit, OnDestroy {
  isConnected = signal(false);
  members = signal<TeamMember[]>([]);
  topics = signal<Topic[]>([]);
  globalFilter = signal('');

  // Computed: only active members for the matrix columns
  activeMembers = computed(() => this.members().filter(m => m.active));

  // Computed: matrix rows with RACI data
  matrixRows = computed(() => {
    const topics = this.topics();
    const activeMembers = this.activeMembers();
    const filter = this.globalFilter().toLowerCase();
    const allMemberIds = new Set(this.members().map(m => m.id));

    // Map of responsible role keys to display labels
    const responsibleRoles: { key: keyof Topic['raci']; label: string }[] = [
      { key: 'r1MemberId', label: 'R1' },
      { key: 'r2MemberId', label: 'R2' },
      { key: 'r3MemberId', label: 'R3' }
    ];

    return topics
      .filter(topic => {
        if (!filter) return true;
        return (
          topic.header.toLowerCase().includes(filter) ||
          (topic.description?.toLowerCase().includes(filter) ?? false) ||
          (topic.tags?.some(t => t.toLowerCase().includes(filter)) ?? false)
        );
      })
      .map(topic => {
        const cells = new Map<string, RaciCell>();
        let hasAnyAssignment = false;

        activeMembers.forEach(member => {
          const roles: string[] = [];

          // Check R1, R2, R3 using mapping
          responsibleRoles.forEach(({ key, label }) => {
            if (topic.raci[key] === member.id) {
              roles.push(label);
              hasAnyAssignment = true;
            }
          });

          // Check Consulted
          if (topic.raci.cMemberIds.includes(member.id)) {
            roles.push('C');
            hasAnyAssignment = true;
          }

          // Check Informed
          if (topic.raci.iMemberIds.includes(member.id)) {
            roles.push('I');
            hasAnyAssignment = true;
          }

          cells.set(member.id, { roles });
        });

        // Check for assignments to inactive members (for orphan detection)
        const responsibleMemberIds = [
          topic.raci.r1MemberId,
          topic.raci.r2MemberId,
          topic.raci.r3MemberId
        ].filter(Boolean);

        responsibleMemberIds.forEach(memberId => {
          if (allMemberIds.has(memberId!)) {
            hasAnyAssignment = true;
          }
        });

        if (topic.raci.cMemberIds.length > 0 || topic.raci.iMemberIds.length > 0) {
          hasAnyAssignment = true;
        }

        return {
          topic,
          isOrphan: !hasAnyAssignment,
          cells
        } as MatrixRow;
      });
  });

  // Computed: count of orphan topics
  orphanCount = computed(() => this.matrixRows().filter(row => row.isOrphan).length);

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
  }

  onGlobalFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.globalFilter.set(value);
  }

  getRoles(row: MatrixRow, memberId: string): string[] {
    return row.cells.get(memberId)?.roles || [];
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

  trackByTopic(_index: number, row: MatrixRow): string {
    return row.topic.id;
  }

  trackByMember(_index: number, member: TeamMember): string {
    return member.id;
  }
}
