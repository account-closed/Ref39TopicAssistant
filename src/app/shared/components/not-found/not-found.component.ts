import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink, Button, Card],
  template: `
    <div class="not-found-container">
      <p-card>
        <div class="not-found-content">
          <i class="pi pi-exclamation-circle not-found-icon"></i>
          <h1>Seite nicht gefunden</h1>
          <p>Die angeforderte Seite existiert nicht oder wurde verschoben.</p>
          <p-button 
            label="Zur Startseite" 
            icon="pi pi-home" 
            routerLink="/search"
            severity="primary">
          </p-button>
        </div>
      </p-card>
    </div>
  `,
  styles: [`
    .not-found-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      padding: 2rem;
    }
    
    .not-found-content {
      text-align: center;
    }
    
    .not-found-icon {
      font-size: 4rem;
      color: var(--p-primary-color);
      margin-bottom: 1rem;
    }
    
    h1 {
      margin-bottom: 0.5rem;
      color: var(--p-text-color);
    }
    
    p {
      margin-bottom: 1.5rem;
      color: var(--p-text-muted-color);
    }
  `]
})
export class NotFoundComponent {}
