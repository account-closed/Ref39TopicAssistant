import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { SearchIndexService } from '../../core/services/search-index.service';
import { SearchResult } from '../../core/services/search-index.service';
import { TeamMember, Topic } from '../../core/models';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, InputText, Card, Tag, Button, Message],
  template: `
    <div class="search-page">
      <!-- Quick Connect Panel - shown when not connected -->
      <div class="quick-connect-panel" *ngIf="!isConnected">
        <p-card styleClass="connect-card">
          <div class="connect-content">
            <i class="pi pi-folder-open connect-icon"></i>
            <h2>Willkommen beim RACI Topic Finder</h2>
            <p>Um zu beginnen, verbinden Sie die Anwendung mit einem Datenverzeichnis.</p>
            <p class="connect-hint">
              Wählen Sie ein Verzeichnis auf einem gemeinsamen Netzlaufwerk (z.B. SMB-Freigabe),
              damit alle Teammitglieder auf die gleichen Daten zugreifen können.
            </p>
            <p-button 
              label="Schnellverbindung - Datenverzeichnis wählen" 
              icon="pi pi-folder-open" 
              (onClick)="quickConnect()"
              [loading]="isConnecting"
              severity="primary"
              size="large">
            </p-button>
            <p-message *ngIf="!hasFileSystemAPI" severity="error" styleClass="mt-3">
              Ihr Browser unterstützt die File System Access API nicht. 
              Bitte verwenden Sie Chrome, Edge oder einen anderen Chromium-basierten Browser.
            </p-message>
            <p-message *ngIf="connectError" severity="error" styleClass="mt-3">
              {{ connectError }}
            </p-message>
          </div>
        </p-card>
      </div>

      <!-- Main search UI - shown when connected -->
      <div *ngIf="isConnected">
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
    </div>
  `,
  styles: [`
    .search-page {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .quick-connect-panel {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }

    .connect-card {
      max-width: 600px;
      text-align: center;
    }

    .connect-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
    }

    .connect-icon {
      font-size: 4rem;
      color: var(--primary-color);
    }

    .connect-content h2 {
      margin: 0;
      color: var(--text-color);
    }

    .connect-content p {
      margin: 0;
      color: var(--text-color-secondary);
    }

    .connect-hint {
      font-size: 0.875rem;
      max-width: 450px;
    }

    .mt-3 {
      margin-top: 1rem;
    }

    .search-header {
      margin-bottom: 2rem;
    }

    .search-header h1 {
      margin: 0 0 0.5rem 0;
      color: var(--text-color);
    }

    .search-header p {
      margin: 0;
      color: var(--text-color-secondary);
    }

    .search-box {
      margin-bottom: 2rem;
    }

    .results-count {
      margin-bottom: 1rem;
      color: var(--text-color-secondary);
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
      box-shadow: var(--shadow-md);
    }

    .result-list p-card.selected {
      border: 2px solid var(--primary-color);
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
    }

    .result-header h3 {
      margin: 0;
      color: var(--text-color);
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
      background: var(--surface-hover);
      border-radius: 4px;
    }

    .raci-item {
      font-size: 0.875rem;
      color: var(--text-color);
    }

    .raci-item strong {
      color: var(--primary-color);
      margin-right: 0.25rem;
    }

    .description {
      margin: 1rem 0;
      color: var(--text-color-secondary);
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
      color: var(--text-color-muted);
    }

    .no-results i, .empty-state i {
      font-size: 3rem;
      color: var(--text-color-muted);
    }

    .no-results p, .empty-state p {
      margin-top: 1rem;
      font-size: 1.125rem;
    }
  `]
})
export class SearchComponent implements OnInit, OnDestroy {
  searchQuery: string = '';
  searchResults: SearchResult[] = [];
  selectedIndex: number = -1;
  isConnected = false;
  isConnecting = false;
  hasFileSystemAPI = false;
  connectError = '';
  private debounceTimer: any;
  private subscriptions: Subscription[] = [];

  constructor(
    private backend: BackendService,
    private searchIndex: SearchIndexService
  ) {}

  ngOnInit(): void {
    // Check File System API support
    this.hasFileSystemAPI = 'showDirectoryPicker' in window;

    // Subscribe to connection status
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
      })
    );

    // Subscribe to datastore changes to rebuild index
    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        if (datastore) {
          this.searchIndex.buildIndex(datastore);
          // Re-run search if there's a query
          if (this.searchQuery) {
            this.performSearch();
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  async quickConnect(): Promise<void> {
    if (!this.hasFileSystemAPI) {
      this.connectError = 'Ihr Browser unterstützt die File System Access API nicht.';
      return;
    }

    this.isConnecting = true;
    this.connectError = '';
    
    try {
      await this.backend.connect();
    } catch (error) {
      console.error('Quick connect failed:', error);
      this.connectError = 'Verbindung fehlgeschlagen: ' + (error as Error).message;
    } finally {
      this.isConnecting = false;
    }
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
