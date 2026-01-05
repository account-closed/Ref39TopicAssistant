import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, effect, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Dialog } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { Divider } from 'primeng/divider';
import { Rating } from 'primeng/rating';
import { MessageService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { HotkeysService } from '@ngneat/hotkeys';
import { BackendService } from '../../core/services/backend.service';
import { SearchEngineService, SearchHit } from '../../core/services/search-engine.service';
import { IndexMonitorService } from '../../core/services/index-monitor.service';
import { Datastore, Topic, Tag as TagModel, TShirtSize } from '../../core/models';
import { getPriorityStars, getSizeSeverity } from '../../shared/utils/topic-display.utils';

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
  imports: [CommonModule, FormsModule, InputText, Card, Tag, Button, Message, ProgressSpinner, Dialog, Toast, Divider, Rating],
  providers: [MessageService],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss'
})
export class SearchComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  searchQuery: string = '';
  searchResults: DisplaySearchResult[] = [];
  selectedIndex: number = -1;
  isConnected = false;
  isConnecting = false;
  hasFileSystemAPI = false;
  connectError = '';
  
  // Index status
  isIndexBuilding = false;
  isIndexReady = false;
  indexDocumentCount = 0;

  // Detail dialog
  detailDialogVisible = false;
  selectedTopic: Topic | null = null;
  selectedTopicTags: TagModel[] = [];
  
  private subscriptions: Subscription[] = [];
  private currentDatastore: Datastore | null = null;

  constructor(
    private backend: BackendService,
    private searchEngine: SearchEngineService,
    private indexMonitor: IndexMonitorService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private hotkeys: HotkeysService,
    private messageService: MessageService
  ) {
    // React to index version changes (triggers when index is rebuilt)
    // Use allowSignalWrites to prevent NG0100 error
    effect(() => {
      const version = this.searchEngine.indexVersion();
      console.debug('[SearchComponent] Index version changed:', version);
      // Only re-run search when index is rebuilt and we have a query
      if (version > 0 && this.searchQuery && this.searchQuery.trim() !== '') {
        // Schedule outside Angular to avoid NG0100, then run inside
        queueMicrotask(() => {
          this.ngZone.run(() => {
            this.performSearch();
            this.cdr.detectChanges();
          });
        });
      }
    }, { allowSignalWrites: true });

    // React to index status changes
    effect(() => {
      const status = this.indexMonitor.indexStatus();
      // Schedule outside Angular to avoid NG0100, then run inside
      queueMicrotask(() => {
        this.ngZone.run(() => {
          this.isIndexBuilding = status.isBuilding;
          this.isIndexReady = status.isReady;
          this.indexDocumentCount = status.documentCount;
          this.cdr.detectChanges();
        });
      });
    }, { allowSignalWrites: true });
  }

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
        }
      })
    );

    // Register hotkeys for quick selection (ctrl+1 to ctrl+5)
    this.registerHotkeys();
  }

  ngAfterViewInit(): void {
    // Focus on search input when the component is ready
    this.focusSearchInput();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Register keyboard shortcuts for fast workflow
   * 
   * Search shortcuts:
   * - ↓/↑: Navigate results (handled via keydown on input)
   * - Enter: Open selected result (handled via keydown on input)
   * 
   * Dialog shortcuts:
   * - Ctrl+Shift+C: Copy mail block
   * - Ctrl+Shift+E: Copy R1 email
   * - Ctrl+Shift+D: Copy description
   * - Esc: Close dialog
   */
  private registerHotkeys(): void {
    // Escape to close dialog and refocus search
    this.subscriptions.push(
      this.hotkeys.addShortcut({ keys: 'escape', preventDefault: false })
        .subscribe(() => {
          if (this.detailDialogVisible) {
            this.closeDetailDialog();
          }
        })
    );

    // Dialog shortcuts: Ctrl+Shift+C for copy mail block
    this.subscriptions.push(
      this.hotkeys.addShortcut({ keys: 'control.shift.c', preventDefault: true })
        .subscribe(() => {
          if (this.detailDialogVisible) {
            this.copyAllForEmail();
          }
        })
    );

    // Dialog shortcuts: Ctrl+Shift+E for copy R1 email
    this.subscriptions.push(
      this.hotkeys.addShortcut({ keys: 'control.shift.e', preventDefault: true })
        .subscribe(() => {
          if (this.detailDialogVisible && this.selectedTopic) {
            const email = this.getMemberEmail(this.selectedTopic.raci.r1MemberId);
            if (email) {
              this.copyField('R1 E-Mail', email);
            }
          }
        })
    );

    // Dialog shortcuts: Ctrl+Shift+D for copy description
    this.subscriptions.push(
      this.hotkeys.addShortcut({ keys: 'control.shift.d', preventDefault: true })
        .subscribe(() => {
          if (this.detailDialogVisible && this.selectedTopic?.description) {
            this.copyField('Beschreibung', this.selectedTopic.description);
          }
        })
    );
  }

  /**
   * Handle keydown events on search input for arrow navigation
   */
  onSearchKeydown(event: KeyboardEvent): void {
    if (this.searchResults.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateResults(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateResults(-1);
        break;
      case 'Enter':
        if (this.selectedIndex >= 0 && !this.detailDialogVisible) {
          event.preventDefault();
          this.selectAndOpenResult(this.selectedIndex);
        }
        break;
    }
  }

  /**
   * Navigate through search results with arrow keys
   * @param direction 1 for down (next item), -1 for up (previous item)
   */
  navigateResults(direction: number): void {
    if (this.searchResults.length === 0) return;
    
    let newIndex = this.selectedIndex + direction;
    if (newIndex < 0) newIndex = this.searchResults.length - 1;
    if (newIndex >= this.searchResults.length) newIndex = 0;
    
    this.selectedIndex = newIndex;
  }

  /**
   * Focus on the search input field
   */
  focusSearchInput(): void {
    setTimeout(() => {
      if (this.searchInputRef?.nativeElement) {
        this.searchInputRef.nativeElement.focus();
      }
    }, SearchComponent.FOCUS_DELAY_MS);
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
    console.debug('[SearchComponent] Search results for', this.searchQuery, ':', hits.length, 'hits');
    
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

  /**
   * Select a result and open detail dialog
   */
  selectAndOpenResult(index: number): void {
    if (index >= 0 && index < this.searchResults.length) {
      this.selectedIndex = index;
      const result = this.searchResults[index];
      if (result.topic) {
        this.openDetailDialog(result.topic);
      }
    }
  }

  selectResult(index: number): void {
    this.selectedIndex = index;
  }

  /**
   * Open the detail dialog for a topic
   */
  openDetailDialog(topic: Topic): void {
    this.selectedTopic = topic;
    this.selectedTopicTags = this.resolveTopicTags(topic);
    this.detailDialogVisible = true;
  }

  /**
   * Close the detail dialog and refocus search
   */
  closeDetailDialog(): void {
    this.detailDialogVisible = false;
    this.selectedTopic = null;
    this.selectedTopicTags = [];
    this.focusSearchInput();
  }

  /**
   * Resolve tag objects for a topic
   */
  private resolveTopicTags(topic: Topic): TagModel[] {
    if (!this.currentDatastore?.tags || !topic.tags) {
      return [];
    }
    return topic.tags
      .map(tagRef => this.currentDatastore!.tags!.find(t => t.id === tagRef || t.name === tagRef))
      .filter((tag): tag is TagModel => tag !== undefined);
  }

  getMemberName(memberId: string): string {
    if (!this.currentDatastore) {
      return 'Unbekannt';
    }
    const member = this.currentDatastore.members.find(m => m.id === memberId);
    return member?.displayName || 'Unbekannt';
  }

  getMemberEmail(memberId: string): string {
    if (!this.currentDatastore) {
      return '';
    }
    const member = this.currentDatastore.members.find(m => m.id === memberId);
    return member?.email || '';
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

  /** Focus delay in ms after dialog close */
  private static readonly FOCUS_DELAY_MS = 100;

  /**
   * Copy a single field to clipboard with toast notification
   */
  copyField(fieldName: string, value: string): void {
    navigator.clipboard.writeText(value).then(
      () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Kopiert',
          detail: `${fieldName} wurde in die Zwischenablage kopiert`,
          life: 2000
        });
      },
      (error) => {
        console.error('Clipboard write failed:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Fehler',
          detail: 'Kopieren fehlgeschlagen. Bitte versuchen Sie es erneut.',
          life: 3000
        });
      }
    );
  }

  /**
   * Copy topic from result card
   */
  copyToClipboard(result: DisplaySearchResult): void {
    if (result.topic) {
      const text = this.formatTopicForClipboard(result.topic);
      navigator.clipboard.writeText(text).then(
        () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Kopiert',
            detail: 'Thema wurde in die Zwischenablage kopiert',
            life: 2000
          });
        },
        (error) => {
          console.error('Clipboard write failed:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Fehler',
            detail: 'Kopieren fehlgeschlagen. Bitte versuchen Sie es erneut.',
            life: 3000
          });
        }
      );
    }
  }

  /**
   * Copy all topic information for email use (master copy)
   */
  copyAllForEmail(): void {
    if (!this.selectedTopic) return;
    
    const text = this.formatTopicForEmail(this.selectedTopic);
    navigator.clipboard.writeText(text).then(
      () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Kopiert',
          detail: 'Alle Informationen wurden für E-Mail kopiert',
          life: 2000
        });
      },
      (error) => {
        console.error('Clipboard write failed:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Fehler',
          detail: 'Kopieren fehlgeschlagen. Bitte versuchen Sie es erneut.',
          life: 3000
        });
      }
    );
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

  /**
   * Format topic with all details for email (master copy)
   */
  private formatTopicForEmail(topic: Topic): string {
    let text = `═══════════════════════════════════════\n`;
    text += `THEMA: ${topic.header}\n`;
    text += `═══════════════════════════════════════\n\n`;
    
    if (topic.description) {
      text += `BESCHREIBUNG:\n${topic.description}\n\n`;
    }

    text += `VERANTWORTLICHE (RACI):\n`;
    text += `───────────────────────────────────────\n`;
    
    const r1Name = this.getMemberName(topic.raci.r1MemberId);
    const r1Email = this.getMemberEmail(topic.raci.r1MemberId);
    text += `R1 (Hauptverantwortlich): ${r1Name}${r1Email ? ` <${r1Email}>` : ''}\n`;
    
    if (topic.raci.r2MemberId) {
      const r2Name = this.getMemberName(topic.raci.r2MemberId);
      const r2Email = this.getMemberEmail(topic.raci.r2MemberId);
      text += `R2 (Stellvertretung): ${r2Name}${r2Email ? ` <${r2Email}>` : ''}\n`;
    }
    
    if (topic.raci.r3MemberId) {
      const r3Name = this.getMemberName(topic.raci.r3MemberId);
      const r3Email = this.getMemberEmail(topic.raci.r3MemberId);
      text += `R3 (Weitere Stellv.): ${r3Name}${r3Email ? ` <${r3Email}>` : ''}\n`;
    }

    if (topic.raci.cMemberIds && topic.raci.cMemberIds.length > 0) {
      text += `\nC (Consulted):\n`;
      for (const memberId of topic.raci.cMemberIds) {
        const name = this.getMemberName(memberId);
        const email = this.getMemberEmail(memberId);
        text += `  • ${name}${email ? ` <${email}>` : ''}\n`;
      }
    }

    if (topic.raci.iMemberIds && topic.raci.iMemberIds.length > 0) {
      text += `\nI (Informed):\n`;
      for (const memberId of topic.raci.iMemberIds) {
        const name = this.getMemberName(memberId);
        const email = this.getMemberEmail(memberId);
        text += `  • ${name}${email ? ` <${email}>` : ''}\n`;
      }
    }

    // Tags
    if (topic.tags && topic.tags.length > 0) {
      text += `\nTAGS:\n`;
      text += `───────────────────────────────────────\n`;
      
      for (const tagRef of topic.tags) {
        const tag = this.currentDatastore?.tags?.find(t => t.id === tagRef || t.name === tagRef);
        if (tag) {
          text += `• ${tag.name}`;
          if (tag.hinweise) {
            text += ` – ${tag.hinweise}`;
          }
          text += `\n`;
          if (tag.copyPasteText) {
            text += `  Textvorlage: ${tag.copyPasteText}\n`;
          }
        } else {
          text += `• ${tagRef}\n`;
        }
      }
    }

    // Classification (Priority & Size)
    if (topic.priority || topic.size) {
      text += `\nKLASSIFIZIERUNG:\n`;
      text += `───────────────────────────────────────\n`;
      if (topic.priority) {
        text += `Priorität: ${topic.priority}/10 ${'★'.repeat(topic.priority)}${'☆'.repeat(10 - topic.priority)}\n`;
      }
      if (topic.size) {
        text += `Größe: ${topic.size}\n`;
      }
    }

    // File references
    if ((topic.hasFileNumber && topic.fileNumber) || (topic.hasSharedFilePath && topic.sharedFilePath)) {
      text += `\nREFERENZEN:\n`;
      text += `───────────────────────────────────────\n`;
      if (topic.hasFileNumber && topic.fileNumber) {
        text += `Aktenzeichen: ${topic.fileNumber}\n`;
      }
      if (topic.hasSharedFilePath && topic.sharedFilePath) {
        text += `Ablageort: ${topic.sharedFilePath}\n`;
      }
    }

    // Notes
    if (topic.notes) {
      text += `\nNOTIZEN:\n`;
      text += `───────────────────────────────────────\n`;
      text += `${topic.notes}\n`;
    }

    // Validity
    text += `\nGÜLTIGKEIT: ${this.getValidityBadge(topic)}\n`;

    return text;
  }

  getPriorityStars(priority: number | undefined): string {
    return getPriorityStars(priority);
  }

  getSizeSeverity(size: TShirtSize | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return getSizeSeverity(size);
  }
}
