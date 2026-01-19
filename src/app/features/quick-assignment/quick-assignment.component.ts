import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageWrapperComponent } from '../../shared/components';

@Component({
  selector: 'app-quick-assignment',
  standalone: true,
  imports: [CommonModule, PageWrapperComponent],
  templateUrl: './quick-assignment.component.html',
  styleUrl: './quick-assignment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickAssignmentComponent {}
