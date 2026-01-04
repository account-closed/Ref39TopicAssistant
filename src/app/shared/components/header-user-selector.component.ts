import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { BackendService } from '../../core/services/backend.service';
import { TeamMember } from '../../core/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header-user-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, Select],
  template: `
    <div class="user-selector">
      <i class="pi pi-user"></i>
      <p-select 
        [(ngModel)]="selectedMemberId" 
        [options]="activeMembers()" 
        optionLabel="displayName" 
        optionValue="id"
        placeholder="Ich bin..."
        [style]="{minWidth: '180px'}"
        [filter]="true"
        filterBy="displayName"
        (onChange)="onUserChange($event)">
      </p-select>
    </div>
  `,
  styles: [`
    .user-selector {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .user-selector i {
      color: var(--primary-color);
      font-size: 1rem;
    }
  `]
})
export class HeaderUserSelectorComponent implements OnInit, OnDestroy {
  selectedMemberId: string = '';
  activeMembers = signal<TeamMember[]>([]);
  
  private subscriptions: Subscription[] = [];

  constructor(private backend: BackendService) {}

  ngOnInit(): void {
    // Load stored user
    const storedMemberId = localStorage.getItem('currentMemberId');
    if (storedMemberId) {
      this.selectedMemberId = storedMemberId;
    }

    // Subscribe to datastore to get active members
    this.subscriptions.push(
      this.backend.datastore$.subscribe(datastore => {
        if (datastore) {
          this.activeMembers.set(datastore.members.filter(m => m.active));
          
          // Validate stored user still exists and is active
          if (this.selectedMemberId) {
            const member = datastore.members.find(
              m => m.id === this.selectedMemberId && m.active
            );
            if (!member) {
              // User no longer valid, clear selection
              this.selectedMemberId = '';
              localStorage.removeItem('currentMemberId');
              localStorage.removeItem('currentMemberName');
            }
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onUserChange(event: { value: string }): void {
    const memberId = event.value;
    if (memberId) {
      const member = this.activeMembers().find(m => m.id === memberId);
      if (member) {
        localStorage.setItem('currentMemberId', member.id);
        localStorage.setItem('currentMemberName', member.displayName);
        this.backend.setCurrentUser(member.id, member.displayName);
      }
    } else {
      localStorage.removeItem('currentMemberId');
      localStorage.removeItem('currentMemberName');
    }
  }
}
