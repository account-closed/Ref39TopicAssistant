import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { Button } from 'primeng/button';
import { BackendService } from '../../../core/services/backend.service';
import { TeamMember } from '../../../core/models';
import { Router } from '@angular/router';

@Component({
  selector: 'app-user-selector-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, Dialog, Select, Button],
  templateUrl: './user-selector-dialog.component.html',
  styleUrl: './user-selector-dialog.component.scss'
})
export class UserSelectorDialogComponent implements OnInit {
  visible: boolean = false;
  selectedMemberId: string = '';
  activeMembers: TeamMember[] = [];

  constructor(
    private backend: BackendService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check if user is already selected
    const storedMemberId = localStorage.getItem('currentMemberId');
    
    if (!storedMemberId) {
      this.showDialog();
    } else {
      // Load stored user
      this.backend.datastore$.subscribe(datastore => {
        if (datastore) {
          const member = datastore.members.find(m => m.id === storedMemberId && m.active);
          if (member) {
            this.backend.setCurrentUser(member.id, member.displayName);
          } else {
            // Stored member not found or inactive, show dialog
            this.showDialog();
          }
        }
      });
    }
  }

  showDialog(): void {
    const datastore = this.backend.getDatastore();
    if (datastore) {
      this.activeMembers = datastore.members.filter(m => m.active);
      this.visible = true;
    }
  }

  confirm(): void {
    if (this.selectedMemberId) {
      const member = this.activeMembers.find(m => m.id === this.selectedMemberId);
      if (member) {
        localStorage.setItem('currentMemberId', member.id);
        localStorage.setItem('currentMemberName', member.displayName);
        this.backend.setCurrentUser(member.id, member.displayName);
        this.visible = false;
        this.router.navigate(['/search']);
      }
    }
  }
}
