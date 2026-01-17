# Contributing Guide

## Development Setup

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- Modern browser with File System Access API support (Chrome/Edge)

### Getting Started

```bash
# Install dependencies
npm ci

# Start development server
npm start

# Run tests
npm test

# Build for production
npm run build
```

## Code Style

### TypeScript

- Strict mode enabled
- No implicit `any`
- Use explicit types for public APIs
- Prefer `interface` over `type` for object shapes

### Angular Patterns

#### Components

```typescript
@Component({
  selector: 'app-feature-name',
  templateUrl: './feature-name.component.html',
  styleUrl: './feature-name.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeatureNameComponent {
  // Use inject() instead of constructor injection
  private readonly service = inject(MyService);
  private readonly destroyRef = inject(DestroyRef);

  // Use signals for state
  protected readonly items = signal<Item[]>([]);
  protected readonly isLoading = signal(false);

  // Use computed for derived state
  protected readonly isEmpty = computed(() => this.items().length === 0);

  ngOnInit(): void {
    // Use takeUntilDestroyed for subscriptions
    this.service.data$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.items.set(data));
  }
}
```

#### Services

```typescript
@Injectable({
  providedIn: 'root'
})
export class FeatureService {
  // Use BehaviorSubject for stateful observables
  private readonly dataSubject = new BehaviorSubject<Data | null>(null);
  readonly data$ = this.dataSubject.asObservable();

  // Use signals for simple state
  readonly isLoading = signal(false);
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `topic-list.component.ts` |
| Components | PascalCase + Component | `TopicListComponent` |
| Services | PascalCase + Service | `TopicService` |
| Interfaces | PascalCase (no prefix) | `Topic`, `TeamMember` |
| Observables | camelCase + $ | `datastore$`, `items$` |
| Signals | camelCase | `isLoading`, `items` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |

### Import Order

1. Angular core (`@angular/*`)
2. Angular modules (`@angular/router`, etc.)
3. RxJS
4. Third-party libraries
5. Internal modules (absolute paths)
6. Relative imports

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MessageService } from 'primeng/api';
import { BackendService } from '@core/services/backend.service';
import { Topic } from '../models/topic.model';
```

## Git Workflow

### Branching

- `main`: Production-ready code
- `feature/*`: New features
- `fix/*`: Bug fixes
- `refactor/*`: Code improvements

### Commit Messages

Use conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `docs`: Documentation only
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(search): add keyboard navigation for results
fix(topics): resolve validation error on save
refactor(app): migrate to signals and inject()
docs: update architecture documentation
```

### Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Ensure build succeeds: `npm run build`
5. Submit PR with clear description
6. Address review feedback

## Testing Requirements

### Unit Tests

- Services: Test business logic and state transitions
- Components: Test user interactions and template bindings
- Utils: Test all edge cases

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('FeatureService', () => {
  let service: FeatureService;

  beforeEach(() => {
    service = new FeatureService();
  });

  describe('methodName', () => {
    it('should do expected behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = service.methodName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Coverage Targets

- Lines: ≥ 70%
- Branches: ≥ 60%
- Critical services: ≥ 80%

## Code Review Checklist

- [ ] Code follows naming conventions
- [ ] No `any` types without justification
- [ ] Subscriptions properly cleaned up
- [ ] OnPush change detection used
- [ ] Signals used for component state
- [ ] Tests included for new functionality
- [ ] No security vulnerabilities introduced
- [ ] Documentation updated if needed

## Common Anti-Patterns to Avoid

### ❌ Subscription Leaks
```typescript
// Bad
ngOnInit() {
  this.service.data$.subscribe(d => this.data = d);
}

// Good
ngOnInit() {
  this.service.data$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(d => this.data.set(d));
}
```

### ❌ Business Logic in Templates
```html
<!-- Bad -->
@if (items.filter(i => i.active && i.date > today).length > 0) { ... }

<!-- Good -->
@if (hasActiveItems()) { ... }
```

### ❌ Shared Mutable State
```typescript
// Bad
export const sharedData = { items: [] };

// Good
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly itemsSubject = new BehaviorSubject<Item[]>([]);
  readonly items$ = this.itemsSubject.asObservable();
}
```

### ❌ Constructor Injection (when inject() works)
```typescript
// Old pattern
constructor(private service: MyService) {}

// Preferred
private readonly service = inject(MyService);
```

## Getting Help

- Check existing code for patterns
- Review the ARCHITECTURE.md for design decisions
- Ask questions in PR comments
