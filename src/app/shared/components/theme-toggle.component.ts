import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, Button, Tooltip],
  template: `
    <p-button 
      [icon]="themeService.isDarkMode() ? 'pi pi-sun' : 'pi pi-moon'"
      [rounded]="true"
      [text]="true"
      (onClick)="themeService.toggleTheme()"
      pTooltip="{{ themeService.isDarkMode() ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln' }}"
      tooltipPosition="bottom">
    </p-button>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
    }
  `]
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);
}
