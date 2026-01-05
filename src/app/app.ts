import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { StatusBarComponent } from './shared/components/status-bar/status-bar.component';
import { UserSelectorDialogComponent } from './shared/components/user-selector-dialog/user-selector-dialog.component';
import { HeaderUserSelectorComponent } from './shared/components/header-user-selector/header-user-selector.component';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle.component';
import { SyncIndicatorComponent } from './shared/components/sync-indicator/sync-indicator.component';
import { BackendService } from './core/services/backend.service';
import { IndexMonitorService } from './core/services/index-monitor.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, 
    Button, 
    Menu,
    Toast,
    ConfirmDialog,
    StatusBarComponent,
    UserSelectorDialogComponent,
    HeaderUserSelectorComponent,
    ThemeToggleComponent,
    SyncIndicatorComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('RACI Topic Finder');
  sidebarVisible: boolean = true;
  menuItems: MenuItem[] = [];
  isConnected = false;
  private stopIndexMonitor: (() => void) | null = null;
  private allMenuItems: MenuItem[] = [];
  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private backend: BackendService,
    private indexMonitor: IndexMonitorService
  ) {}

  ngOnInit(): void {
    // Define all menu items with IDs for robust filtering
    this.allMenuItems = [
      {
        id: 'search',
        label: 'Suche',
        icon: 'pi pi-search',
        command: () => this.router.navigate(['/search'])
      },
      {
        id: 'quick-assignment',
        label: 'Schnellzuordnung',
        icon: 'pi pi-bolt',
        command: () => this.router.navigate(['/quick-assignment'])
      },
      {
        id: 'topics',
        label: 'Themen verwalten',
        icon: 'pi pi-list',
        command: () => this.router.navigate(['/topics'])
      },
      {
        id: 'members',
        label: 'Teammitglieder verwalten',
        icon: 'pi pi-users',
        command: () => this.router.navigate(['/members'])
      },
      {
        id: 'topics-by-member',
        label: 'Themen nach Teammitglied',
        icon: 'pi pi-user',
        command: () => this.router.navigate(['/topics-by-member'])
      },
      {
        id: 'tags',
        label: 'Tags verwalten',
        icon: 'pi pi-tags',
        command: () => this.router.navigate(['/tags'])
      },
      {
        id: 'settings',
        label: 'Einstellungen',
        icon: 'pi pi-cog',
        command: () => this.router.navigate(['/settings'])
      }
    ];

    // Subscribe to connection status and filter menu items accordingly
    this.subscriptions.push(
      this.backend.connectionStatus$.subscribe(connected => {
        this.isConnected = connected;
        this.updateMenuItems();
      })
    );

    // Initialize menu items based on current connection state
    this.updateMenuItems();

    // Initialize user from localStorage if available
    const storedMemberId = localStorage.getItem('currentMemberId');
    const storedMemberName = localStorage.getItem('currentMemberName');
    
    if (storedMemberId && storedMemberName) {
      this.backend.setCurrentUser(storedMemberId, storedMemberName);
    }

    // Start the search index monitor
    this.stopIndexMonitor = this.indexMonitor.start({ intervalMs: 5000 });
  }

  // Menu item IDs that are always visible (even when not connected)
  private readonly ALWAYS_VISIBLE_MENU_IDS = ['search', 'settings'];

  private updateMenuItems(): void {
    if (this.isConnected) {
      // Show all menu items when connected
      this.menuItems = [...this.allMenuItems];
    } else {
      // Show only search (welcome screen) and settings when not connected
      this.menuItems = this.allMenuItems.filter(
        item => this.ALWAYS_VISIBLE_MENU_IDS.includes(item.id || '')
      );
    }
  }

  ngOnDestroy(): void {
    if (this.stopIndexMonitor) {
      this.stopIndexMonitor();
    }
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
  }
}
