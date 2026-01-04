import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-topics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Themen verwalten</h1>
      <p>CRUD interface for topics with PrimeNG table</p>
      <p><em>Coming soon...</em></p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
    }
  `]
})
export class TopicsComponent {}
