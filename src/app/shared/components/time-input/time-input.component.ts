import {
  Component,
  input,
  output,
  computed,
  signal,
  ChangeDetectionStrategy,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { InputNumber } from 'primeng/inputnumber';

/**
 * A time input component that displays hours and minutes separately.
 * Stores the value internally as decimal hours (e.g., 1.5 for 1h 30min).
 * Implements ControlValueAccessor for use with ngModel and reactive forms.
 */
@Component({
  selector: 'app-time-input',
  imports: [CommonModule, FormsModule, InputNumber],
  template: `
    <div class="time-input-container">
      <p-inputNumber
        [ngModel]="hoursValue()"
        (ngModelChange)="onHoursChange($event)"
        [min]="0"
        [max]="maxHours()"
        [showButtons]="showButtons()"
        suffix="h"
        [style]="{ width: '80px' }"
        [inputStyle]="{ width: '60px' }"
        [disabled]="disabled()">
      </p-inputNumber>
      <p-inputNumber
        [ngModel]="minutesValue()"
        (ngModelChange)="onMinutesChange($event)"
        [min]="0"
        [max]="59"
        [step]="minuteStep()"
        [showButtons]="showButtons()"
        suffix="min"
        [style]="{ width: '90px' }"
        [inputStyle]="{ width: '60px' }"
        [disabled]="disabled()">
      </p-inputNumber>
    </div>
  `,
  styles: [`
    .time-input-container {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimeInputComponent),
      multi: true,
    },
  ],
})
export class TimeInputComponent implements ControlValueAccessor {
  /** Maximum hours allowed */
  readonly maxHours = input(99);

  /** Minute step increment (default: 5 minutes) */
  readonly minuteStep = input(5);

  /** Whether to show +/- buttons */
  readonly showButtons = input(true);

  /** Whether the input is disabled */
  readonly disabled = input(false);

  /** Internal decimal hours value */
  private readonly decimalValue = signal(0);

  /** Derived hours (whole number) */
  readonly hoursValue = computed(() => Math.floor(this.decimalValue()));

  /** Derived minutes (0-59) */
  readonly minutesValue = computed(() => {
    const decimal = this.decimalValue();
    return Math.round((decimal - Math.floor(decimal)) * 60);
  });

  /** Value change event for non-form usage */
  readonly valueChange = output<number>();

  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number): void {
    this.decimalValue.set(value ?? 0);
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onHoursChange(hours: number): void {
    const newValue = (hours ?? 0) + this.minutesValue() / 60;
    this.updateValue(newValue);
  }

  onMinutesChange(minutes: number): void {
    const newValue = this.hoursValue() + (minutes ?? 0) / 60;
    this.updateValue(newValue);
  }

  private updateValue(value: number): void {
    this.decimalValue.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
    this.onTouched();
  }
}
