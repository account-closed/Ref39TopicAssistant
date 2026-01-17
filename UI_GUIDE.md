# UI Guide

## Overview

This document defines the UI patterns, component usage, and styling guidelines for the RACI Topic Finder application. The UI is intentionally utilitarian and focused on clarity over aesthetics.

## Design Principles

1. **Clarity over beauty**: Information density is acceptable; aesthetics are secondary
2. **Direct communication**: Minimal copy, clinical text, no persuasive language
3. **Actionable feedback**: Errors are factual, not empathetic
4. **Safe defaults**: Destructive actions require confirmation

## PrimeNG Component Usage

### Theme Configuration

The application uses PrimeNG's Aura theme with dark mode support:

```typescript
providePrimeNG({
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.p-dark'
    }
  }
})
```

### Buttons

Use PrimeNG Button consistently:

```html
<!-- Primary action -->
<p-button label="Speichern" icon="pi pi-save"></p-button>

<!-- Secondary/text action -->
<p-button label="Abbrechen" [text]="true"></p-button>

<!-- Icon-only button -->
<p-button icon="pi pi-trash" [text]="true" severity="danger"></p-button>

<!-- Outlined variant -->
<p-button label="Details" [outlined]="true"></p-button>
```

Button severity mapping:
- `primary` (default): Main actions
- `secondary`: Alternative actions
- `success`: Positive confirmations
- `danger`: Destructive actions
- `warn`: Warning/caution actions

### Forms

Use reactive forms with PrimeNG form components:

```html
<input pInputText [(ngModel)]="searchQuery" placeholder="Suchen...">

<p-select 
  [options]="members" 
  [(ngModel)]="selectedMember"
  optionLabel="displayName"
  placeholder="Mitglied wählen">
</p-select>

<p-calendar [(ngModel)]="date" dateFormat="dd.mm.yy"></p-calendar>
```

### Dialogs

```html
<p-dialog 
  header="Thema bearbeiten" 
  [(visible)]="dialogVisible"
  [modal]="true"
  [style]="{width: '50vw'}">
  <!-- Content -->
</p-dialog>
```

### Tables

```html
<p-table [value]="topics" [paginator]="true" [rows]="10">
  <ng-template #header>
    <tr>
      <th>Thema</th>
      <th>Verantwortlich</th>
    </tr>
  </ng-template>
  <ng-template #body let-topic>
    <tr>
      <td>{{ topic.header }}</td>
      <td>{{ getMemberName(topic.raci.r1MemberId) }}</td>
    </tr>
  </ng-template>
</p-table>
```

### Toast Messages

```typescript
// Success
this.messageService.add({
  severity: 'success',
  summary: 'Gespeichert',
  detail: 'Änderungen wurden gespeichert.',
  life: 2000
});

// Error
this.messageService.add({
  severity: 'error',
  summary: 'Fehler',
  detail: 'Speichern fehlgeschlagen.',
  life: 5000
});

// Warning
this.messageService.add({
  severity: 'warn',
  summary: 'Hinweis',
  detail: 'Bearbeitung durch anderen Nutzer blockiert.',
  life: 3000
});
```

### Tags/Badges

```html
<!-- Status tags -->
<p-tag [value]="status" [severity]="getStatusSeverity(status)"></p-tag>

<!-- Removable tags -->
<p-tag [value]="tag.name" [style]="getTagStyle(tag)" [removable]="true" (onRemove)="removeTag(tag)"></p-tag>
```

## Layout Patterns

### Page Layout

```html
<div class="page-container">
  <div class="page-header">
    <h1>Page Title</h1>
    <div class="page-actions">
      <p-button label="Action"></p-button>
    </div>
  </div>
  <div class="page-content">
    <!-- Content -->
  </div>
</div>
```

### Card Layout

```html
<p-card>
  <ng-template #header>
    <div class="card-header">Title</div>
  </ng-template>
  <p>Content</p>
  <ng-template #footer>
    <div class="card-footer">
      <p-button label="Action"></p-button>
    </div>
  </ng-template>
</p-card>
```

## Text and Copy Guidelines

### Headings
- Clear, descriptive, no marketing language
- Use German consistently throughout the UI

### Labels
- Concise, action-oriented
- Example: "Speichern" not "Klicken Sie hier zum Speichern"

### Error Messages
- State what happened
- State what to do
- No apologetic language

```
❌ "Oops! Something went wrong. We're sorry for the inconvenience."
✅ "Speichern fehlgeschlagen. Prüfen Sie die Netzwerkverbindung."
```

### Confirmation Dialogs
- State the action clearly
- Show what will be affected
- Default to safe option (Cancel)

```
Header: "Thema löschen"
Message: "Das Thema 'XYZ' wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
Buttons: [Abbrechen] [Löschen]
```

## Accessibility

### Required Practices

1. **Focus Management**: Dialogs trap focus, return focus when closed
2. **Keyboard Navigation**: All interactive elements must be keyboard accessible
3. **Labels**: Form inputs must have associated labels
4. **ARIA**: Use ARIA attributes where semantic HTML is insufficient

### Color Contrast

- Text on background: minimum 4.5:1 contrast ratio
- Large text (18px+): minimum 3:1 contrast ratio
- Icons with meaning: must have text alternative

## Responsive Design

The application is primarily designed for desktop use. Minimum supported width: 1024px.

For smaller screens:
- Sidebar can be collapsed
- Tables may use horizontal scroll
- Dialogs adjust to viewport width

## CSS Variables

Use PrimeNG's CSS variables for theming:

```scss
.custom-element {
  background: var(--p-surface-0);
  color: var(--p-text-color);
  border: 1px solid var(--p-surface-border);
  padding: var(--p-content-padding);
}
```

## Component Checklist

When creating new components:

- [ ] Use `ChangeDetectionStrategy.OnPush`
- [ ] Use signals for local state
- [ ] Use `inject()` for dependencies
- [ ] Use `takeUntilDestroyed()` for subscriptions
- [ ] Add proper ARIA labels
- [ ] Follow naming conventions
- [ ] Use PrimeNG components consistently
- [ ] Test with keyboard navigation
