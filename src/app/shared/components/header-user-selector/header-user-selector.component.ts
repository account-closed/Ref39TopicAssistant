import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { BackendService } from '../../../core/services/backend.service';
import { TeamMember } from '../../../core/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header-user-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, Select],
  templateUrl: './header-user-selector.component.html',
  styleUrl: './header-user-selector.component.scss'
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
            if (member) {
              // User exists, set them as current user
              this.backend.setCurrentUser(member.id, member.displayName);
            } else {
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
