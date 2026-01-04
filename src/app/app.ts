import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Drawer } from 'primeng/drawer';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { StatusBarComponent } from './shared/components/status-bar.component';
import { UserSelectorDialogComponent } from './shared/components/user-selector-dialog.component';
import { HeaderUserSelectorComponent } from './shared/components/header-user-selector.component';
import { BackendService } from './core/services/backend.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, 
    Drawer, 
    Button, 
    Menu,
    Toast,
    ConfirmDialog,
    StatusBarComponent,
    UserSelectorDialogComponent,
    HeaderUserSelectorComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('RACI Topic Finder');
  sidebarVisible: boolean = true;
  menuItems: MenuItem[] = [];

  constructor(
    private router: Router,
    private backend: BackendService
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
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
  }
}
