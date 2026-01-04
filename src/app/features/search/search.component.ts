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
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss'
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
