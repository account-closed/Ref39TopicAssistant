import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { BackendService } from '../../core/services/backend.service';
import { Topic, TeamMember, Datastore } from '../../core/models';

interface MatrixCell {
  roles: string[]; // Array of role abbreviations (R1, R2, R3, C, I)
}

interface MatrixRow {
  topic: Topic;
  cells: Map<string, MatrixCell>; // Key: memberId, Value: cell with roles
}

interface RoleConfig {
  severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
  tooltip: string;
}

const ROLE_CONFIG: Record<string, RoleConfig> = {
  R1: { severity: 'success', tooltip: 'Hauptverantwortlich' },
  R2: { severity: 'info', tooltip: 'Stellvertretung' },
  R3: { severity: 'secondary', tooltip: 'Weitere Stellvertretung' },
  C: { severity: 'warn', tooltip: 'Consulted (wird konsultiert)' },
  I: { severity: 'contrast', tooltip: 'Informed (wird informiert)' }
};

@Component({
  selector: 'app-raci-matrix',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    Tag,
    Tooltip
  ],
  templateUrl: './raci-matrix.component.html',
  styleUrl: './raci-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaciMatrixComponent implements OnInit, OnDestroy {
  // State signals
  isConnected = signal(false);
  topics = signal<Topic[]>([]);
  members = signal<TeamMember[]>([]);

  // Computed: active members sorted by displayName
  activeMembers = computed<TeamMember[]>(() => 
    this.members()
      .filter(m => m.active)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  // Computed: matrix data with rows and cells
  matrixData = computed<MatrixRow[]>(() => {
    const topics = this.topics();
    const activeMembers = this.activeMembers();
    const rows: MatrixRow[] = [];

    topics.forEach(topic => {
      const cells = new Map<string, MatrixCell>();

      activeMembers.forEach(member => {
        const roles: string[] = [];

        // Check R1
        if (topic.raci.r1MemberId === member.id) {
          roles.push('R1');
        }

        // Check R2
        if (topic.raci.r2MemberId === member.id) {
          roles.push('R2');
        }

        // Check R3
        if (topic.raci.r3MemberId === member.id) {
          roles.push('R3');
        }

        // Check C (Consulted)
        if (topic.raci.cMemberIds.includes(member.id)) {
          roles.push('C');
        }

        // Check I (Informed)
        if (topic.raci.iMemberIds.includes(member.id)) {
          roles.push('I');
        }

        cells.set(member.id, { roles });
      });

      rows.push({ topic, cells });
    });

    return rows;
  });

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
    this.topics.set(datastore.topics);
    this.members.set(datastore.members);
  }

  getRoleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return ROLE_CONFIG[role]?.severity || 'secondary';
  }

  getRoleTooltip(role: string): string {
    return ROLE_CONFIG[role]?.tooltip || '';
  }

  getCellRoles(row: MatrixRow, memberId: string): string[] {
    return row.cells.get(memberId)?.roles || [];
  }

  trackByTopicId(_index: number, row: MatrixRow): string {
    return row.topic.id;
  }

  trackByMemberId(_index: number, member: TeamMember): string {
    return member.id;
  }
}
