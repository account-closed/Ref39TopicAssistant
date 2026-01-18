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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { BackendService } from '../../../core/services/backend.service';
import { LoadConfigService, MAX_OVERHEAD_FACTOR } from '../../../core/services/load-config.service';
import { LoadCalculationService } from '../../../core/services/load-calculation.service';
import { LoadConfig, DEFAULT_LOAD_CONFIG, BaseLoadComponent, Datastore, TeamMember } from '../../../core/models';

@Component({
  selector: 'app-load-config',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    Card,
    Button,
    InputNumber,
    ToggleSwitch,
    Tooltip,
    TableModule,
    Toast,
  ],
  providers: [MessageService],
  templateUrl: './load-config.component.html',
  styleUrl: './load-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadConfigComponent implements OnInit, OnDestroy {
  private readonly backend = inject(BackendService);
  private readonly loadConfigService = inject(LoadConfigService);
  private readonly loadService = inject(LoadCalculationService);
  private readonly messageService = inject(MessageService);

  protected readonly isConnected = signal(false);
  protected readonly config = signal<LoadConfig | null>(null);
  protected readonly members = signal<TeamMember[]>([]);
  protected readonly isSaving = signal(false);

  // Constants for template
  protected readonly maxOverheadFactor = MAX_OVERHEAD_FACTOR;
  protected readonly maxOverheadPercent = Math.round(MAX_OVERHEAD_FACTOR * 100);

  // Editable values
  protected contractHours = signal(41);
  protected overheadFactor = signal(0.35);
  protected overheadPercent = computed(() => Math.round(this.overheadFactor() * 100));
  protected alpha = signal(1.0);
  protected beta = signal(0.25);
  protected baseComponents = signal<BaseLoadComponent[]>([]);

  // Member-specific settings
  protected memberPartTimeFactors = signal<Record<string, number>>({});
  protected memberBaseLoadOverrides = signal<Record<string, number>>({});

  protected readonly effectiveCapacity = computed(() => {
    return this.contractHours() * (1 - this.overheadFactor());
  });

  protected readonly totalBaseLoad = computed(() => {
    return this.baseComponents()
      .filter(c => c.enabled)
      .reduce((sum, c) => sum + c.hoursPerWeek, 0);
  });

  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected.set(connected);
      })
    );

    this.subscriptions.push(
      this.loadConfigService.config$.subscribe(config => {
        if (config) {
          this.config.set(config);
          this.loadConfigValues(config);
        }
      })
    );

    this.subscriptions.push(
      this.backend.datastore$.subscribe((datastore: Datastore | null) => {
        if (datastore) {
          this.members.set(datastore.members || []);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadConfigValues(config: LoadConfig): void {
    this.contractHours.set(config.capacity.contractHoursPerWeek);
    this.overheadFactor.set(config.capacity.overheadFactor);
    this.alpha.set(config.topicComplexity.alpha);
    this.beta.set(config.topicComplexity.beta);
    this.baseComponents.set([...config.baseLoad.components]);
    this.memberPartTimeFactors.set({ ...config.members.partTimeFactors });
    
    // Convert member overrides to simple record
    const overrides: Record<string, number> = {};
    for (const [memberId, override] of Object.entries(config.baseLoad.memberOverrides)) {
      overrides[memberId] = override.hoursPerWeek;
    }
    this.memberBaseLoadOverrides.set(overrides);
  }

  protected async saveConfig(): Promise<void> {
    const currentConfig = this.config();
    if (!currentConfig) return;

    this.isSaving.set(true);

    try {
      // Build member overrides
      const memberOverrides: Record<string, { hoursPerWeek: number }> = {};
      for (const [memberId, hours] of Object.entries(this.memberBaseLoadOverrides())) {
        if (hours !== undefined && hours !== null) {
          memberOverrides[memberId] = { hoursPerWeek: hours };
        }
      }

      const updatedConfig: LoadConfig = {
        ...currentConfig,
        capacity: {
          contractHoursPerWeek: this.contractHours(),
          overheadFactor: this.overheadFactor(),
        },
        topicComplexity: {
          alpha: this.alpha(),
          beta: this.beta(),
        },
        baseLoad: {
          ...currentConfig.baseLoad,
          defaultHoursPerWeek: this.totalBaseLoad(),
          components: this.baseComponents(),
          memberOverrides,
        },
        members: {
          partTimeFactors: this.memberPartTimeFactors(),
        },
      };

      await this.loadConfigService.saveConfig(updatedConfig);
      this.loadService.invalidateCache();

      this.messageService.add({
        severity: 'success',
        summary: 'Gespeichert',
        detail: 'Konfiguration erfolgreich gespeichert',
      });
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Fehler',
        detail: `Speichern fehlgeschlagen: ${(error as Error).message}`,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  protected resetToDefaults(): void {
    const defaultConfig = JSON.parse(JSON.stringify(DEFAULT_LOAD_CONFIG)) as LoadConfig;
    this.loadConfigValues(defaultConfig);
    this.messageService.add({
      severity: 'info',
      summary: 'Zurückgesetzt',
      detail: 'Werte auf Standardwerte zurückgesetzt (noch nicht gespeichert)',
    });
  }

  protected updateComponentEnabled(index: number, enabled: boolean): void {
    const components = [...this.baseComponents()];
    components[index] = { ...components[index], enabled };
    this.baseComponents.set(components);
  }

  protected updateComponentHours(index: number, hours: number): void {
    const components = [...this.baseComponents()];
    components[index] = { ...components[index], hoursPerWeek: hours };
    this.baseComponents.set(components);
  }

  protected addBaseComponent(): void {
    const components = [...this.baseComponents()];
    components.push({ name: 'Neuer Termin', hoursPerWeek: 0.5, enabled: true });
    this.baseComponents.set(components);
  }

  protected removeBaseComponent(index: number): void {
    const components = [...this.baseComponents()];
    components.splice(index, 1);
    this.baseComponents.set(components);
  }

  protected updateComponentName(index: number, name: string): void {
    const components = [...this.baseComponents()];
    components[index] = { ...components[index], name };
    this.baseComponents.set(components);
  }

  protected getMemberPartTimeFactor(memberId: string): number {
    return this.memberPartTimeFactors()[memberId] ?? 1.0;
  }

  protected setMemberPartTimeFactor(memberId: string, factor: number | null): void {
    const factors = { ...this.memberPartTimeFactors() };
    if (factor === null || factor === 1.0) {
      delete factors[memberId];
    } else {
      factors[memberId] = factor;
    }
    this.memberPartTimeFactors.set(factors);
  }

  protected getMemberBaseLoadOverride(memberId: string): number | null {
    return this.memberBaseLoadOverrides()[memberId] ?? null;
  }

  protected setMemberBaseLoadOverride(memberId: string, hours: number | null): void {
    const overrides = { ...this.memberBaseLoadOverrides() };
    if (hours === null) {
      delete overrides[memberId];
    } else {
      overrides[memberId] = hours;
    }
    this.memberBaseLoadOverrides.set(overrides);
  }

  protected formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  protected getMemberEffectiveCapacity(memberId: string): number {
    const factor = this.getMemberPartTimeFactor(memberId);
    return this.effectiveCapacity() * factor;
  }
}
