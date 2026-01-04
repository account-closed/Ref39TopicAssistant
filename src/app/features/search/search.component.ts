import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { BackendService } from '../../core/services/backend.service';
import { SearchIndexService } from '../../core/services/search-index.service';
import { SearchResult } from '../../core/services/search-index.service';
import { TeamMember, Topic } from '../../core/models';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, InputText, Card, Tag, Button],
  template: `
    <div class="search-page">
      <div class="search-header">
        <h1>Schnellsuche</h1>
        <p>Finden Sie schnell den zuständigen Ansprechpartner für ein Thema</p>
      </div>

      <div class="search-box">
        <span class="p-input-icon-left" style="width: 100%">
          <i class="pi pi-search"></i>
          <input 
            type="text" 
            pInputText 
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Thema suchen..."
            style="width: 100%"
            #searchInput
            autofocus />
        </span>
      </div>

      <div class="search-results" *ngIf="searchResults.length > 0">
        <p class="results-count">{{ searchResults.length }} Ergebnis(se) gefunden</p>
        
        <div class="result-list">
          <p-card *ngFor="let result of searchResults; let i = index" 
                  [ngClass]="{'selected': i === selectedIndex}"
                  (click)="selectResult(i)">
            <ng-template pTemplate="header">
              <div class="result-header">
                <h3>{{ result.topic.header }}</h3>
                <p-tag [value]="getValidityBadge(result.topic)" 
                       [severity]="getValiditySeverity(result.topic)">
                </p-tag>
              </div>
            </ng-template>
            
            <div class="result-body">
              <div class="raci-info" *ngIf="result.topic.raci">
                <div class="raci-item">
                  <strong>R1:</strong> {{ getMemberName(result.topic.raci.r1MemberId) }}
                </div>
                <div class="raci-item" *ngIf="result.topic.raci.r2MemberId">
                  <strong>R2:</strong> {{ getMemberName(result.topic.raci.r2MemberId) }}
                </div>
                <div class="raci-item" *ngIf="result.topic.raci.r3MemberId">
                  <strong>R3:</strong> {{ getMemberName(result.topic.raci.r3MemberId) }}
                </div>
              </div>

              <p *ngIf="result.topic.description" class="description">
                {{ result.topic.description }}
              </p>

              <div class="tags" *ngIf="result.topic.tags && result.topic.tags.length > 0">
                <p-tag *ngFor="let tag of result.topic.tags" 
                       [value]="tag" 
                       severity="info">
                </p-tag>
              </div>
            </div>

            <ng-template pTemplate="footer">
              <div class="result-actions">
                <p-button label="Details" icon="pi pi-info-circle" severity="secondary" size="small"></p-button>
                <p-button label="Kopieren" icon="pi pi-copy" severity="secondary" size="small" (onClick)="copyToClipboard(result.topic)"></p-button>
              </div>
            </ng-template>
          </p-card>
        </div>
      </div>

      <div class="no-results" *ngIf="searchQuery && searchResults.length === 0">
        <i class="pi pi-search" style="font-size: 3rem; color: #ccc;"></i>
        <p>Keine Ergebnisse gefunden</p>
      </div>

      <div class="empty-state" *ngIf="!searchQuery">
        <i class="pi pi-search" style="font-size: 3rem; color: #ccc;"></i>
        <p>Geben Sie einen Suchbegriff ein, um Themen zu finden</p>
      </div>
    </div>
  `,
  styles: [`
    .search-page {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .search-header {
      margin-bottom: 2rem;
    }

    .search-header h1 {
      margin: 0 0 0.5rem 0;
      color: #333;
    }

    .search-header p {
      margin: 0;
      color: #666;
    }

    .search-box {
      margin-bottom: 2rem;
    }

    .results-count {
      margin-bottom: 1rem;
      color: #666;
      font-weight: 600;
    }

    .result-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .result-list p-card {
      cursor: pointer;
      transition: transform 0.2s;
    }

    .result-list p-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }

    .result-list p-card.selected {
      border: 2px solid #007bff;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
    }

    .result-header h3 {
      margin: 0;
      color: #333;
      font-size: 1.25rem;
    }

    .result-body {
      padding: 0 1rem 1rem 1rem;
    }

    .raci-info {
      display: flex;
      gap: 2rem;
      margin-bottom: 1rem;
      padding: 0.5rem;
      background: #f8f9fa;
      border-radius: 4px;
    }

    .raci-item {
      font-size: 0.875rem;
    }

    .raci-item strong {
      color: #007bff;
      margin-right: 0.25rem;
    }

    .description {
      margin: 1rem 0;
      color: #666;
    }

    .tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .result-actions {
      display: flex;
      gap: 0.5rem;
    }

    .no-results, .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #999;
    }

    .no-results p, .empty-state p {
      margin-top: 1rem;
      font-size: 1.125rem;
    }
  `]
})
export class SearchComponent implements OnInit {
  searchQuery: string = '';
  searchResults: SearchResult[] = [];
  selectedIndex: number = -1;
  private debounceTimer: any;

  constructor(
    private backend: BackendService,
    private searchIndex: SearchIndexService
  ) {}

  ngOnInit(): void {
    // Subscribe to datastore changes to rebuild index
    this.backend.datastore$.subscribe(datastore => {
      if (datastore) {
        this.searchIndex.buildIndex(datastore);
        // Re-run search if there's a query
        if (this.searchQuery) {
          this.performSearch();
        }
      }
    });
  }

  onSearchChange(query: string): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.performSearch();
    }, 100); // 100ms debounce
  }

  performSearch(): void {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.searchResults = [];
      this.selectedIndex = -1;
      return;
    }

    this.searchResults = this.searchIndex.search(this.searchQuery, 50);
    this.selectedIndex = this.searchResults.length > 0 ? 0 : -1;
  }

  selectResult(index: number): void {
    this.selectedIndex = index;
  }

  getMemberName(memberId: string): string {
    const member = this.searchIndex.getMember(memberId);
    return member?.displayName || 'Unbekannt';
  }

  getValidityBadge(topic: Topic): string {
    if (topic.validity.alwaysValid) {
      return 'Immer gültig';
    }

    const now = new Date();
    const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;

    if (validFrom && now < validFrom) {
      return `Ab ${validFrom.toLocaleDateString('de-DE')}`;
    }

    if (validTo && now > validTo) {
      return 'Abgelaufen';
    }

    if (validFrom && !validTo) {
      return `Gültig ab ${validFrom.toLocaleDateString('de-DE')}`;
    }

    if (validFrom && validTo) {
      return `Gültig bis ${validTo.toLocaleDateString('de-DE')}`;
    }

    return 'Gültig';
  }

  getValiditySeverity(topic: Topic): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    if (topic.validity.alwaysValid) {
      return 'success';
    }

    const now = new Date();
    const validFrom = topic.validity.validFrom ? new Date(topic.validity.validFrom) : null;
    const validTo = topic.validity.validTo ? new Date(topic.validity.validTo) : null;

    if (validFrom && now < validFrom) {
      return 'warn';
    }

    if (validTo && now > validTo) {
      return 'danger';
    }

    return 'info';
  }

  copyToClipboard(topic: Topic): void {
    const text = this.formatTopicForClipboard(topic);
    navigator.clipboard.writeText(text).then(() => {
      alert('In Zwischenablage kopiert');
    });
  }

  private formatTopicForClipboard(topic: Topic): string {
    let text = `Thema: ${topic.header}\n\n`;
    
    if (topic.description) {
      text += `Beschreibung: ${topic.description}\n\n`;
    }

    text += `Verantwortlich:\n`;
    text += `  R1: ${this.getMemberName(topic.raci.r1MemberId)}\n`;
    
    if (topic.raci.r2MemberId) {
      text += `  R2: ${this.getMemberName(topic.raci.r2MemberId)}\n`;
    }
    
    if (topic.raci.r3MemberId) {
      text += `  R3: ${this.getMemberName(topic.raci.r3MemberId)}\n`;
    }

    return text;
  }
}
