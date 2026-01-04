import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-quick-assignment',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Schnellzuordnung</h1>
      <p>Quick assignment workflow for incoming documents</p>
      <p><em>Coming soon...</em></p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
    }
  `]
})
export class QuickAssignmentComponent {}
