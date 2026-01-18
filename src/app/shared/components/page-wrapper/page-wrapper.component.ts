import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * PageWrapperComponent provides a consistent layout structure for feature pages.
 * It includes a header section with title and optional description/actions,
 * and a content area for the main page content.
 * 
 * Usage:
 * ```html
 * <app-page-wrapper title="Page Title" [description]="description">
 *   <ng-container actions>
 *     <p-button label="Action"></p-button>
 *   </ng-container>
 *   <ng-container content>
 *     <!-- Main page content -->
 *   </ng-container>
 * </app-page-wrapper>
 * ```
 */
@Component({
  selector: 'app-page-wrapper',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page-wrapper.component.html',
  styleUrl: './page-wrapper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageWrapperComponent {
  /** Page title displayed in the header */
  title = input.required<string>();
  
  /** Optional description text displayed below the title */
  description = input<string>();
}
