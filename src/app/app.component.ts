import { Component, signal, OnInit, OnDestroy, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Button } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Tooltip } from 'primeng/tooltip';
import { StatusBarComponent } from './shared/components/status-bar/status-bar.component';
import { UserSelectorDialogComponent } from './shared/components/user-selector-dialog/user-selector-dialog.component';
import { HeaderUserSelectorComponent } from './shared/components/header-user-selector/header-user-selector.component';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle.component';
import { SyncIndicatorComponent } from './shared/components/sync-indicator/sync-indicator.component';
import { SaveButtonComponent } from './shared/components/save-button/save-button.component';
import { BackendService } from './core/services/backend.service';
import { IndexMonitorService } from './core/services/index-monitor.service';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet, 
    Button, 
    Toast,
    ConfirmDialog,
    Tooltip,
    StatusBarComponent,
    UserSelectorDialogComponent,
    HeaderUserSelectorComponent,
    ThemeToggleComponent,
    SyncIndicatorComponent,
    SaveButtonComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly backend = inject(BackendService);
  private readonly indexMonitor = inject(IndexMonitorService);

  protected readonly title = signal('RACI Topic Finder');
  protected sidebarVisible = signal(true);
  protected menuItems = signal<NavItem[]>([]);
  protected isConnected = signal(false);

  private stopIndexMonitor: (() => void) | null = null;
  private allMenuItems: NavItem[] = [];

  ngOnInit(): void {
    // Define all menu items with IDs for robust filtering
    this.allMenuItems = [
      {
        id: 'search',
        label: 'Suche',
        icon: 'pi pi-search',
        route: '/search'
      },
      {
        id: 'quick-assignment',
        label: 'Schnellzuordnung',
        icon: 'pi pi-bolt',
        route: '/quick-assignment'
      },
      {
        id: 'topics',
        label: 'Themen verwalten',
        icon: 'pi pi-list',
        route: '/topics'
      },
      {
        id: 'members',
        label: 'Teammitglieder verwalten',
        icon: 'pi pi-users',
        route: '/members'
      },
      {
        id: 'topics-by-member',
        label: 'Themen nach Teammitglied',
        icon: 'pi pi-user',
        route: '/topics-by-member'
      },
      {
        id: 'raci-matrix',
        label: 'RACI-Matrix',
        icon: 'pi pi-table',
        command: () => this.router.navigate(['/raci-matrix'])
      },
      {
        id: 'tags',
        label: 'Tags verwalten',
        icon: 'pi pi-tags',
        route: '/tags'
      },
      {
        id: 'visualizations',
        label: 'Visualisierungen',
        icon: 'pi pi-chart-bar',
        route: '/visualizations'
      },
      {
        id: 'visualizations-load',
        label: 'Auslastung & Verantwortung',
        icon: 'pi pi-chart-line',
        route: '/visualizations/load'
      },
      {
        id: 'settings',
        label: 'Einstellungen',
        icon: 'pi pi-cog',
        route: '/settings'
      }
    ];

    // Subscribe to connection status using takeUntilDestroyed
    this.backend.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(connected => {
        this.isConnected.set(connected);
        this.updateMenuItems();
      });

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
    const connected = this.isConnected();
    // Show all menu items but mark non-accessible ones as disabled
    this.menuItems.set(
      this.allMenuItems.map(item => ({
        ...item,
        disabled: !connected && !this.ALWAYS_VISIBLE_MENU_IDS.includes(item.id)
      }))
    );
  }

  ngOnDestroy(): void {
    if (this.stopIndexMonitor) {
      this.stopIndexMonitor();
    }
  }

  toggleSidebar(): void {
    this.sidebarVisible.update(v => !v);
  }

  isActiveRoute(route: string): boolean {
    return this.router.url === route;
  }

  onNavigate(item: NavItem): void {
    if (!item.disabled) {
      this.router.navigate([item.route]);
    }
  }
}
