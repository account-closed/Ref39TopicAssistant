import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';

@Component({
  selector: 'app-visualizations',
  imports: [Card, Button, RouterLink],
  template: `
    <div class="page-container">
      <div class="visualization-header">
        <h1>
          <i class="pi pi-chart-bar"></i>
          Visualisierungen
        </h1>
        <p>Interaktive Diagramme zur Analyse Ihrer Themen, Abhängigkeiten und Strukturen</p>
      </div>
      
      <div class="visualization-cards">
        <p-card styleClass="visualization-card">
          <ng-template #header>
            <div class="card-icon sunburst">
              <i class="pi pi-sun"></i>
            </div>
          </ng-template>
          <h3>Sunburst Diagramm</h3>
          <p>Hierarchische Ansicht der Themen nach Tags. Zoomen Sie durch die Ebenen und sehen Sie Größe und Priorität auf einen Blick.</p>
          <div class="features">
            <span><i class="pi pi-check"></i> Zoombar</span>
            <span><i class="pi pi-check"></i> Größenbasiert</span>
            <span><i class="pi pi-check"></i> Tag-Hierarchie</span>
          </div>
          <ng-template #footer>
            <p-button
              label="Öffnen"
              icon="pi pi-arrow-right"
              iconPos="right"
              routerLink="/visualizations/sunburst"
            ></p-button>
          </ng-template>
        </p-card>
        
        <p-card styleClass="visualization-card">
          <ng-template #header>
            <div class="card-icon network">
              <i class="pi pi-share-alt"></i>
            </div>
          </ng-template>
          <h3>Netzwerk Diagramm</h3>
          <p>Sehen Sie alle Beziehungen und Abhängigkeiten zwischen Themen als interaktives Netzwerk mit Drag & Drop.</p>
          <div class="features">
            <span><i class="pi pi-check"></i> Interaktiv</span>
            <span><i class="pi pi-check"></i> Abhängigkeiten</span>
            <span><i class="pi pi-check"></i> Tag-Verknüpfungen</span>
          </div>
          <ng-template #footer>
            <p-button
              label="Öffnen"
              icon="pi pi-arrow-right"
              iconPos="right"
              routerLink="/visualizations/network"
            ></p-button>
          </ng-template>
        </p-card>
        
        <p-card styleClass="visualization-card">
          <ng-template #header>
            <div class="card-icon treemap">
              <i class="pi pi-th-large"></i>
            </div>
          </ng-template>
          <h3>Treemap</h3>
          <p>Flächenbasierte Darstellung aller Themen. Gruppieren Sie nach Tags, Mitgliedern, Größe oder Priorität.</p>
          <div class="features">
            <span><i class="pi pi-check"></i> Größenvergleich</span>
            <span><i class="pi pi-check"></i> Gruppierbar</span>
            <span><i class="pi pi-check"></i> Prioritätsfarben</span>
          </div>
          <ng-template #footer>
            <p-button
              label="Öffnen"
              icon="pi pi-arrow-right"
              iconPos="right"
              routerLink="/visualizations/treemap"
            ></p-button>
          </ng-template>
        </p-card>
      </div>
    </div>
  `,
  styles: [`
    .visualization-header {
      text-align: center;
      margin-bottom: 2rem;
      
      h1 {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        margin: 0 0 0.5rem 0;
        color: var(--p-text-color);
        font-size: 2rem;
        
        i {
          color: var(--p-primary-color);
        }
      }
      
      p {
        margin: 0;
        color: var(--p-text-muted-color);
        font-size: 1.1rem;
        max-width: 600px;
        margin: 0 auto;
      }
    }
    
    .visualization-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    
    :host ::ng-deep .visualization-card {
      height: 100%;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      
      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
      }
      
      .p-card-body {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      
      .p-card-content {
        flex: 1;
      }
    }
    
    .card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 80px;
      font-size: 2.5rem;
      color: white;
      border-radius: 8px 8px 0 0;
      
      &.sunburst {
        background: linear-gradient(135deg, #f97316, #eab308);
      }
      
      &.network {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
      }
      
      &.treemap {
        background: linear-gradient(135deg, #22c55e, #06b6d4);
      }
    }
    
    h3 {
      margin: 0 0 0.75rem 0;
      color: var(--p-text-color);
      font-size: 1.25rem;
    }
    
    p {
      margin: 0 0 1rem 0;
      color: var(--p-text-muted-color);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    
    .features {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1rem;
      
      span {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.8rem;
        color: var(--p-text-color);
        
        i {
          color: #22c55e;
          font-size: 0.7rem;
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VisualizationsComponent {}
