# Architecture Documentation

## Overview

RACI Topic Finder is an Angular 21 application for managing organizational topics using the RACI model (Responsible, Accountable, Consulted, Informed). The application is designed to work with file-based storage via File System Access API or a REST API backend.

## Technology Stack

- **Angular 21** with strict TypeScript
- **PrimeNG 21** with Aura theme for UI components
- **RxJS 7.8** for reactive state management
- **FlexSearch** for high-performance full-text search
- **Vitest** for unit testing

## Directory Structure

```
src/app/
├── core/                    # Singleton services and application core
│   ├── models/              # Data models and interfaces
│   │   ├── datastore.model.ts
│   │   ├── topic.model.ts
│   │   ├── team-member.model.ts
│   │   ├── tag.model.ts
│   │   ├── lock.model.ts
│   │   └── refresh.model.ts
│   └── services/            # Core application services
│       ├── backend.service.ts          # Abstract backend interface
│       ├── file-system-backend.service.ts  # File System API implementation
│       ├── rest-backend.service.ts     # REST API implementation (placeholder)
│       ├── cache.service.ts            # Single source of truth for UI state
│       ├── datastore.service.ts        # Data persistence coordination
│       ├── search-engine.service.ts    # FlexSearch wrapper
│       ├── index-monitor.service.ts    # Search index lifecycle management
│       ├── lock.service.ts             # Concurrency control
│       ├── refresh.service.ts          # Multi-client sync
│       ├── theme.service.ts            # Light/dark theme management
│       └── write-queue.service.ts      # Write operation batching
│
├── features/                # Feature modules (one per route)
│   ├── search/              # Main search interface
│   ├── topics/              # Topic CRUD management
│   ├── members/             # Team member management
│   ├── tags/                # Tag management
│   ├── topics-by-member/    # Topics filtered by member
│   ├── quick-assignment/    # Batch RACI assignment
│   └── settings/            # Application settings
│
├── shared/                  # Shared/reusable code
│   ├── components/          # Reusable UI components
│   │   ├── header-user-selector/
│   │   ├── save-button/
│   │   ├── status-bar/
│   │   ├── sync-indicator/
│   │   ├── theme-toggle/
│   │   └── user-selector-dialog/
│   └── utils/               # Pure utility functions
│       ├── validation.utils.ts
│       └── topic-display.utils.ts
│
├── app.component.ts         # Root application component
├── app.config.ts            # Application configuration and providers
└── app.routes.ts            # Route definitions
```

## Architecture Layers

### 1. UI Layer (Components)

Components are responsible for:
- Rendering templates and handling user interactions
- Using signals for local component state
- Calling services for data operations
- **NOT** containing business logic

Key patterns:
- Use `ChangeDetectionStrategy.OnPush` for performance
- Use `inject()` function instead of constructor injection
- Use `takeUntilDestroyed()` for subscription cleanup
- Use signals (`signal()`, `computed()`) for reactive state

### 2. State/Cache Layer

The `CacheService` is the **single source of truth** for application state:

```
UI + Index  <-->  CacheService  <-->  Backend
```

Principles:
- All UI reads come from the cache
- All UI changes update the cache first
- Backend persistence is asynchronous
- Cache handles conflict detection and resolution

### 3. Data Access Layer

Abstract `BackendService` interface with implementations:
- `FileSystemBackendService`: File System Access API for SMB shares
- `RestBackendService`: REST API (placeholder for future)

The backend layer handles:
- Connection management
- Data serialization/deserialization
- Lock acquisition and release
- Multi-client refresh signaling

### 4. Domain Models

Located in `core/models/`, these are pure TypeScript interfaces:

- `Datastore`: Root data container with schema version
- `Topic`: RACI topic with assignments, metadata, and optional irregular task estimation
- `TeamMember`: User identity and contact information
- `Tag`: Categorization with optional hints and copy text
- `Lock`: Concurrency control state
- `Refresh`: Multi-client sync signal
- `IrregularTaskEstimation`: P80-based estimation for irregular tasks

### 5. Irregular Task Calculation

The `IrregularTaskService` handles P80-based estimation for irregular tasks:

**Data Model** (`IrregularTaskEstimation`):
```typescript
interface IrregularTaskEstimation {
  frequencyMin: number;       // N_a - minimum events per year
  frequencyTypical: number;   // N_b - typical events per year  
  frequencyMax: number;       // N_c - maximum events per year
  effortMin: number;          // T_a - minimum hours per event
  effortTypical: number;      // T_b - typical hours per event
  effortMax: number;          // T_c - maximum hours per event
  varianceClass: 'L0'|'L1'|'L2'|'L3'|'L4';
  waveClass: 'W0'|'W1'|'W2'|'W3'|'W4';
}
```

**Formulas**:
```
# P80 estimation
k = VARIANCE_CLASS_WEIGHTS[varianceClass]  // 0.40–0.90
N_P80 = N_b + k × (N_c - N_b)
T_P80 = T_b + k × (T_c - T_b)

# Weekly planning share
yearlyHours_P80 = N_P80 × T_P80
weeklyPlanningHours = yearlyHours_P80 / 52

# Weekly peak load (for risk analysis)
w = WAVE_CLASS_MULTIPLIERS[waveClass]  // 1.0–4.0
weeklyPeakHours = w × weeklyPlanningHours
```

**Mapping Tables**:
| Variance Class | k (weight) | Wave Class | w (multiplier) |
|----------------|------------|------------|----------------|
| L0 | 0.40 | W0 | 1.0 |
| L1 | 0.50 | W1 | 1.5 |
| L2 | 0.60 | W2 | 2.0 |
| L3 | 0.75 | W3 | 3.0 |
| L4 | 0.90 | W4 | 4.0 |

**Validation Rules**:
- Ordering: `0 ≤ min ≤ typical ≤ max` for both frequency and effort
- Soft warning if `effortMax / effortTypical > 3` (high uncertainty)
- Soft warning if `frequencyTypical = 0` (no planning impact)
- Soft warning if `weeklyPeakHours > 41` (overload risk)

## Data Flow

### Read Flow
```
Component -> CacheService.datastore$ -> Display
```

### Write Flow
```
Component -> CacheService.updateX() -> Mark dirty
                                    -> WriteQueueService -> BackendService
                                    -> SearchEngineService (rebuild index)
```

### Sync Flow
```
RefreshService (polling) -> Detect change -> CacheService.handleExternalChanges()
                                          -> Conflict resolution if needed
                                          -> Update UI via observables
```

## Naming Conventions

### Files
- Components: `feature-name.component.ts`
- Services: `feature-name.service.ts`
- Models: `entity-name.model.ts`
- Utils: `purpose.utils.ts`
- Tests: `*.spec.ts`

### Classes
- Components: `FeatureNameComponent`
- Services: `FeatureNameService`
- Models/Interfaces: `EntityName` (no suffix)

### Variables
- Observables: suffix with `$` (e.g., `datastore$`)
- Signals: no suffix, use descriptive names
- Constants: `UPPER_SNAKE_CASE`

## State Management

### Signals (Local State)
```typescript
// In components
protected readonly title = signal('RACI Topic Finder');
protected readonly isLoading = signal(false);

// Derived state
protected readonly isEmpty = computed(() => this.items().length === 0);
```

### RxJS Observables (Shared State)
```typescript
// In services
readonly datastore$ = this.cacheStateSubject.asObservable();

// In components - always use takeUntilDestroyed
this.backend.datastore$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(data => this.handleData(data));
```

## Security Considerations

1. **No unsafe DOM manipulation**: Use Angular's built-in sanitization
2. **No innerHTML bypass**: Unless explicitly reviewed and documented
3. **Input validation**: Validate all user inputs before processing
4. **No secrets in code**: Use environment configuration for sensitive data
5. **File System Access**: Requires explicit user permission gesture

## Testing Strategy

### Unit Tests
- Services: Test business logic and state transitions
- Components: Use Angular TestBed with mock services
- Utils: Test pure functions with deterministic inputs

### Test Patterns
```typescript
// Use Vitest
import { describe, it, expect, vi } from 'vitest';

// Mock services
const mockBackend = {
  datastore$: of(null),
  connectionStatus$: new BehaviorSubject(false)
};

// Provide in TestBed
{ provide: BackendService, useValue: mockBackend }
```

## Performance Considerations

1. **OnPush Change Detection**: All components use `ChangeDetectionStrategy.OnPush`
2. **Search Index**: FlexSearch provides sub-millisecond search for 5000+ topics
3. **Lazy Loading**: Routes can be lazy-loaded (currently not used due to small app size)
4. **Signal-based State**: Signals provide fine-grained reactivity
