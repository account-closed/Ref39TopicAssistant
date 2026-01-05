import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Subscription } from 'rxjs';
import { BackendService } from '../../core/services/backend.service';
import { SearchEngineService, SearchHit } from '../../core/services/search-engine.service';
import { Datastore, Topic } from '../../core/models';

/**
 * Extended search result with resolved topic data.
 */
interface DisplaySearchResult {
  hit: SearchHit;
  topic?: Topic;
}

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, InputText, Card, Tag, Button, Message],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss'
})
export class SearchComponent implements OnInit, OnDestroy {
  searchQuery: string = '';
  searchResults: DisplaySearchResult[] = [];
  selectedIndex: number = -1;
  isConnected = false;
  isConnecting = false;
  hasFileSystemAPI = false;
  connectError = '';
  private subscriptions: Subscription[] = [];
  private currentDatastore: Datastore | null = null;

  constructor(
    private backend: BackendService,
    private searchEngine: SearchEngineService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
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

    // Subscribe to datastore changes to keep local reference for entity resolution
    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        if (datastore) {
          this.currentDatastore = datastore;
          // Re-run search if there's a query (index was rebuilt)
          if (this.searchQuery) {
            // Use setTimeout to avoid ExpressionChangedAfterItHasBeenCheckedError
            this.ngZone.runOutsideAngular(() => {
              setTimeout(() => {
                this.ngZone.run(() => {
                  this.performSearch();
                  this.cdr.detectChanges();
                });
              }, 0);
            });
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
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

  /**
   * Called on every keystroke. Performs search immediately.
   */
  onSearchChange(_query: string): void {
    this.performSearch();
  }

  performSearch(): void {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.searchResults = [];
      this.selectedIndex = -1;
      return;
    }

    // Search and get top 10 results
    const hits = this.searchEngine.search(this.searchQuery, 10);
    
    // Resolve topics for display
    this.searchResults = hits.map(hit => this.resolveSearchHit(hit));
    this.selectedIndex = this.searchResults.length > 0 ? 0 : -1;
  }

  /**
   * Resolves a SearchHit to include the full topic data.
   */
  private resolveSearchHit(hit: SearchHit): DisplaySearchResult {
    const result: DisplaySearchResult = { hit };
    
    if (!this.currentDatastore) {
      return result;
    }

    result.topic = this.currentDatastore.topics.find(t => t.id === hit.entityId);
    return result;
  }

  selectResult(index: number): void {
    this.selectedIndex = index;
  }

  getMemberName(memberId: string): string {
    if (!this.currentDatastore) {
      return 'Unbekannt';
    }
    const member = this.currentDatastore.members.find(m => m.id === memberId);
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

  copyToClipboard(result: DisplaySearchResult): void {
    if (result.topic) {
      const text = this.formatTopicForClipboard(result.topic);
      navigator.clipboard.writeText(text).then(() => {
        // Could add a toast notification here
      });
    }
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

    if (topic.raci.cMemberIds && topic.raci.cMemberIds.length > 0) {
      text += `  C: ${topic.raci.cMemberIds.map(id => this.getMemberName(id)).join(', ')}\n`;
    }

    if (topic.raci.iMemberIds && topic.raci.iMemberIds.length > 0) {
      text += `  I: ${topic.raci.iMemberIds.map(id => this.getMemberName(id)).join(', ')}\n`;
    }

    return text;
  }
}
