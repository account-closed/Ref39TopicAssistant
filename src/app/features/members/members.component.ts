import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Teammitglieder verwalten</h1>
      <p>CRUD interface for team members</p>
      <p><em>Coming soon...</em></p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
    }
  `]
})
export class MembersComponent {}
