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
import { LoadConfig, DEFAULT_LOAD_CONFIG, BaseLoadComponent } from '../../../core/models';
import { formatHoursMinutes } from '../../../shared/utils/time-format.utils';
import { TimeInputComponent } from '../../../shared/components';

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
    TimeInputComponent,
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
  
  // Role weights
  protected roleWeightR1 = signal(3.0);
  protected roleWeightR2 = signal(2.0);
  protected roleWeightR3 = signal(1.5);
  protected roleWeightC = signal(1.0);
  protected roleWeightI = signal(0.5);
  
  // Size thresholds
  protected sizeThresholdXXSMax = signal(1.0);
  protected sizeThresholdXSMax = signal(2.0);
  protected sizeThresholdSMax = signal(8.0);
  protected sizeThresholdMMax = signal(14.0);
  protected sizeThresholdLMax = signal(20.0);
  protected sizeThresholdXLMin = signal(20.0);

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
        // When connected, ensure config is loaded
        if (connected && !this.loadConfigService.getConfig()) {
          void this.loadConfigService.loadOrCreate().catch(err => {
            console.error('[LoadConfig] Failed to load config:', err);
          });
        }
      })
    );

    this.subscriptions.push(
      this.loadConfigService.config$.subscribe(config => {
        this.applyConfig(config);
      })
    );

    // If already connected but config not loaded, load it now
    this.applyConfig(this.loadConfigService.getConfig());
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Apply config values to component state.
   */
  private applyConfig(config: LoadConfig | null): void {
    if (config) {
      this.config.set(config);
      this.loadConfigValues(config);
    }
  }

  private loadConfigValues(config: LoadConfig): void {
    this.contractHours.set(config.capacity.contractHoursPerWeek);
    this.overheadFactor.set(config.capacity.overheadFactor);
    this.alpha.set(config.topicComplexity.alpha);
    this.beta.set(config.topicComplexity.beta);
    this.baseComponents.set([...config.baseLoad.components]);
    
    // Load role weights
    this.roleWeightR1.set(config.roleWeights.R1);
    this.roleWeightR2.set(config.roleWeights.R2);
    this.roleWeightR3.set(config.roleWeights.R3);
    this.roleWeightC.set(config.roleWeights.C);
    this.roleWeightI.set(config.roleWeights.I);
    
    // Load size thresholds
    const thresholds = config.sizes.thresholds;
    const xxs = thresholds.find(t => t.name === 'XXS');
    const xs = thresholds.find(t => t.name === 'XS');
    const s = thresholds.find(t => t.name === 'S');
    const m = thresholds.find(t => t.name === 'M');
    const l = thresholds.find(t => t.name === 'L');
    const xl = thresholds.find(t => t.name === 'XL');
    
    if (xxs) this.sizeThresholdXXSMax.set(xxs.max);
    if (xs) this.sizeThresholdXSMax.set(xs.max);
    if (s) this.sizeThresholdSMax.set(s.max);
    if (m) this.sizeThresholdMMax.set(m.max);
    if (l) this.sizeThresholdLMax.set(l.max);
    if (xl) this.sizeThresholdXLMin.set(xl.min);
  }

  protected async saveConfig(): Promise<void> {
    const currentConfig = this.config();
    if (!currentConfig) return;
    
    // Validate size thresholds are in ascending order
    // XXS.max < XS.max < S.max < M.max < L.max <= XL.min
    const xxsMax = this.sizeThresholdXXSMax();
    const xsMax = this.sizeThresholdXSMax();
    const sMax = this.sizeThresholdSMax();
    const mMax = this.sizeThresholdMMax();
    const lMax = this.sizeThresholdLMax();
    const xlMin = this.sizeThresholdXLMin();
    
    if (xxsMax >= xsMax || xsMax >= sMax || sMax >= mMax || mMax >= lMax || lMax > xlMin) {
      this.messageService.add({
        severity: 'error',
        summary: 'Ungültige Schwellenwerte',
        detail: 'Die Schwellenwerte müssen in aufsteigender Reihenfolge sein',
      });
      return;
    }

    this.isSaving.set(true);

    try {
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
          defaultHoursPerWeek: this.totalBaseLoad(),
          components: this.baseComponents(),
        },
        roleWeights: {
          R1: this.roleWeightR1(),
          R2: this.roleWeightR2(),
          R3: this.roleWeightR3(),
          C: this.roleWeightC(),
          I: this.roleWeightI(),
        },
        sizes: {
          thresholds: [
            { name: 'XXS', min: 0.0, max: xxsMax },
            { name: 'XS', min: xxsMax, max: xsMax },
            { name: 'S', min: xsMax, max: sMax },
            { name: 'M', min: sMax, max: mMax },
            { name: 'L', min: mMax, max: lMax },
            { name: 'XL', min: xlMin, max: Infinity },
          ],
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

  protected formatHoursMinutes = formatHoursMinutes;
}
