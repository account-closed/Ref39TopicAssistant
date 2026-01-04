import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-topics-by-member',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Themen nach Teammitglied</h1>
      <p>View topics filtered by team member assignments</p>
      <p><em>Coming soon...</em></p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
    }
  `]
})
export class TopicsByMemberComponent {}
