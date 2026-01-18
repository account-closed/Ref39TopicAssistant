import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Tag as PrimeTag } from 'primeng/tag';
import { Panel } from 'primeng/panel';
import { Tooltip } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { Message } from 'primeng/message';
import { Subscription } from 'rxjs';
import { BackendService } from '../../../core/services/backend.service';
import { LoadCalculationService, LoadCalculationResult, MemberLoadResult, LoadStatus } from '../../../core/services/load-calculation.service';
import { Datastore } from '../../../core/models';

@Component({
  selector: 'app-load-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    Card,
    Button,
    PrimeTag,
    Panel,
    Tooltip,
    TableModule,
    Message,
  ],
  templateUrl: './load-dashboard.component.html',
  styleUrl: './load-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadDashboardComponent implements OnInit, OnDestroy {
  private readonly backend = inject(BackendService);
  private readonly loadService = inject(LoadCalculationService);

  protected readonly isConnected = signal(false);
  protected readonly loadResult = signal<LoadCalculationResult | null>(null);
  protected readonly selectedMember = signal<MemberLoadResult | null>(null);
  protected readonly showFormula = signal(false);

  protected readonly sortedMemberLoads = computed(() => {
    const result = this.loadResult();
    if (!result) return [];
    return [...result.memberLoads].sort((a, b) => b.totalLoad - a.totalLoad);
  });

  protected readonly maxLoad = computed(() => {
    const loads = this.sortedMemberLoads();
    if (loads.length === 0) return 1;
    return Math.max(...loads.map((m) => m.totalLoad), 1);
  });

  protected readonly formulaExplanation = computed(() => {
    return this.loadService.getFormulaExplanation();
  });

  protected readonly hasWarnings = computed(() => {
    const result = this.loadResult();
    return result && result.warnings.length > 0;
  });

  protected readonly inactiveR1Warnings = computed(() => {
    const result = this.loadResult();
    if (!result) return [];
    return result.warnings.filter((w) => w.type === 'topic-inactive-r1');
  });

  protected readonly noR1Warnings = computed(() => {
    const result = this.loadResult();
    if (!result) return [];
    return result.warnings.filter((w) => w.type === 'topic-no-r1');
  });

  protected readonly roleBreakdown = computed(() => {
    const result = this.loadResult();
    if (!result) return { r1: 0, r2: 0, r3: 0, c: 0, i: 0 };

    let r1 = 0, r2 = 0, r3 = 0, c = 0, i = 0;
    for (const member of result.memberLoads) {
      for (const tc of member.topicContributions) {
        switch (tc.role) {
          case 'R1': r1 += tc.loadContribution; break;
          case 'R2': r2 += tc.loadContribution; break;
          case 'R3': r3 += tc.loadContribution; break;
          case 'C': c += tc.loadContribution; break;
          case 'I': i += tc.loadContribution; break;
        }
      }
    }
    return { r1, r2, r3, c, i };
  });

  protected readonly totalSystemLoad = computed(() => {
    const breakdown = this.roleBreakdown();
    return breakdown.r1 + breakdown.r2 + breakdown.r3 + breakdown.c + breakdown.i;
  });

  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe((connected) => {
        this.isConnected.set(connected);
      })
    );

    this.subscriptions.push(
      this.backend.datastore$.subscribe((datastore) => {
        if (datastore) {
          this.calculateLoad(datastore);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private calculateLoad(datastore: Datastore): void {
    const result = this.loadService.calculateLoad(
      datastore.members,
      datastore.topics,
      datastore.tags || [],
      datastore.revisionId
    );
    this.loadResult.set(result);
  }

  protected getStatusSeverity(status: LoadStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (status) {
      case 'underutilized': return 'info';
      case 'normal': return 'success';
      case 'overloaded': return 'warn';
      case 'unsustainable': return 'danger';
    }
  }

  protected getStatusLabel(status: LoadStatus): string {
    switch (status) {
      case 'underutilized': return 'Unterausgelastet';
      case 'normal': return 'Normal';
      case 'overloaded': return 'Überlastet';
      case 'unsustainable': return 'Nicht tragbar';
    }
  }

  protected getLoadBarColor(normalizedLoad: number): string {
    if (normalizedLoad < 0.5) return 'var(--p-blue-500)';
    if (normalizedLoad <= 1.5) return 'var(--p-green-500)';
    if (normalizedLoad <= 2.0) return 'var(--p-orange-500)';
    return 'var(--p-red-500)';
  }

  protected getLoadPercentage(load: number): number {
    const max = this.maxLoad();
    return Math.min((load / max) * 100, 100);
  }

  protected selectMember(member: MemberLoadResult): void {
    this.selectedMember.set(member);
  }

  protected clearSelection(): void {
    this.selectedMember.set(null);
  }

  protected toggleFormula(): void {
    this.showFormula.update((v) => !v);
  }

  protected formatNumber(value: number): string {
    return value.toFixed(2);
  }

  protected getRoleLabel(role: string): string {
    switch (role) {
      case 'R1': return 'Hauptverantwortlich (R1)';
      case 'R2': return 'Erster Stellvertreter (R2)';
      case 'R3': return 'Zweiter Stellvertreter (R3)';
      case 'C': return 'Konsultiert (C)';
      case 'I': return 'Informiert (I)';
      default: return role;
    }
  }

  protected getRoleBreakdownPercentage(roleValue: number): number {
    const total = this.totalSystemLoad();
    if (total === 0) return 0;
    return (roleValue / total) * 100;
  }
}
