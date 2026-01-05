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
import { BackendService } from './core/services/backend.service';
import { IndexMonitorService } from './core/services/index-monitor.service';

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
    ThemeToggleComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('RACI Topic Finder');
  sidebarVisible: boolean = true;
  menuItems: MenuItem[] = [];
  private stopIndexMonitor: (() => void) | null = null;

  constructor(
    private router: Router,
    private backend: BackendService,
    private indexMonitor: IndexMonitorService
  ) {}

  ngOnInit(): void {
    this.menuItems = [
      {
        label: 'Suche',
        icon: 'pi pi-search',
        command: () => this.router.navigate(['/search'])
      },
      {
        label: 'Schnellzuordnung',
        icon: 'pi pi-bolt',
        command: () => this.router.navigate(['/quick-assignment'])
      },
      {
        label: 'Themen verwalten',
        icon: 'pi pi-list',
        command: () => this.router.navigate(['/topics'])
      },
      {
        label: 'Teammitglieder verwalten',
        icon: 'pi pi-users',
        command: () => this.router.navigate(['/members'])
      },
      {
        label: 'Themen nach Teammitglied',
        icon: 'pi pi-user',
        command: () => this.router.navigate(['/topics-by-member'])
      },
      {
        label: 'Tags verwalten',
        icon: 'pi pi-tags',
        command: () => this.router.navigate(['/tags'])
      },
      {
        label: 'Einstellungen',
        icon: 'pi pi-cog',
        command: () => this.router.navigate(['/settings'])
      }
    ];

    // Initialize user from localStorage if available
    const storedMemberId = localStorage.getItem('currentMemberId');
    const storedMemberName = localStorage.getItem('currentMemberName');
    
    if (storedMemberId && storedMemberName) {
      this.backend.setCurrentUser(storedMemberId, storedMemberName);
    }

    // Start the search index monitor
    this.stopIndexMonitor = this.indexMonitor.start({ intervalMs: 5000 });
  }

  ngOnDestroy(): void {
    if (this.stopIndexMonitor) {
      this.stopIndexMonitor();
    }
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
  }
}
