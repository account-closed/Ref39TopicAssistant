import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Einstellungen / Status</h1>
      <p>File connections, diagnostics, and application settings</p>
      <p><em>Coming soon...</em></p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
    }
  `]
})
export class SettingsComponent {}
