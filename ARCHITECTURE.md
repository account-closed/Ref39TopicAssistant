# Architecture Documentation

This document describes the architecture of the RACI Topic Finder application.

## Overview

RACI Topic Finder is a **browser-only Angular application** designed to run directly from a UNC path on a Windows network share. It uses the File System Access API to read/write shared JSON files for multi-user collaboration.

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Angular | 21.x |
| UI Library | PrimeNG | 21.x |
| Theme | Aura | - |
| Search | FlexSearch | 0.8.x |
| State | RxJS + Signals | - |
| Language | TypeScript | 5.9.x |

## Application Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Angular Application                    │
├──────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Features   │  │   Shared    │  │      Core       │  │
│  │             │  │             │  │                 │  │
│  │ • Search    │  │ • Components│  │ • Services      │  │
│  │ • Topics    │  │ • Utils     │  │ • Models        │  │
│  │ • Members   │  │             │  │ • Handlers      │  │
│  │ • Settings  │  │             │  │                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                   Backend Abstraction                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              BackendService (abstract)               │ │
│  │  • datastore$    • connect()    • addTopic()        │ │
│  │  • connectionStatus$            • updateTopic()     │ │
│  └─────────────────────────────────────────────────────┘ │
│          │                              │                │
│  ┌───────┴───────┐          ┌──────────┴──────────┐    │
│  │ FileSystem    │          │  REST Backend       │    │
│  │ Backend       │          │  (future)           │    │
│  └───────────────┘          └─────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│                    Storage Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ datastore    │  │   lock.json  │  │ refresh.json │   │
│  │   .json      │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Folder Structure

```
src/app/
├── core/                    # Singleton services and core logic
│   ├── handlers/            # Global error handlers
│   │   └── global-error.handler.ts
│   ├── models/              # Data models and interfaces
│   │   ├── datastore.model.ts
│   │   ├── topic.model.ts
│   │   ├── team-member.model.ts
│   │   ├── tag.model.ts
│   │   ├── lock.model.ts
│   │   └── refresh.model.ts
│   └── services/            # Core application services
│       ├── backend.service.ts           # Abstract backend interface
│       ├── file-system-backend.service.ts
│       ├── file-connection.service.ts   # FS Access API wrapper
│       ├── datastore.service.ts         # Data management
│       ├── datastore-commit.service.ts  # Transaction handling
│       ├── lock.service.ts              # Concurrency control
│       ├── refresh.service.ts           # Multi-client sync
│       ├── search-engine.service.ts     # FlexSearch wrapper
│       ├── search-index.service.ts      # Legacy search
│       ├── index-monitor.service.ts     # Index lifecycle
│       └── theme.service.ts             # Dark/light mode
│
├── features/               # Feature-based modules
│   ├── search/             # Main search page
│   ├── topics/             # Topic management
│   ├── members/            # Team member management
│   ├── tags/               # Tag management
│   ├── quick-assignment/   # Bulk RACI assignment
│   ├── topics-by-member/   # Member-centric view
│   └── settings/           # App settings
│
├── shared/                 # Shared/reusable code
│   ├── components/         # Reusable UI components
│   │   ├── not-found/      # 404 page
│   │   ├── status-bar/     # Connection status
│   │   ├── sync-indicator/ # Sync state
│   │   ├── theme-toggle/   # Dark/light toggle
│   │   ├── header-user-selector/
│   │   └── user-selector-dialog/
│   └── utils/              # Utility functions
│       ├── validation.utils.ts
│       └── topic-display.utils.ts
│
├── app.ts                  # Root component
├── app.config.ts           # Application configuration
└── app.routes.ts           # Route definitions
```

## Key Design Patterns

### 1. Backend Abstraction

The `BackendService` abstract class defines the interface for all storage operations:

```typescript
abstract class BackendService {
  abstract datastore$: Observable<Datastore | null>;
  abstract connectionStatus$: Observable<boolean>;
  abstract connect(): Promise<void>;
  abstract addTopic(topic: Topic): Promise<boolean>;
  // ... etc
}
```

**Implementations:**
- `FileSystemBackendService` - Uses File System Access API
- `RestBackendService` - Future REST API implementation

### 2. Concurrency Control

Multi-user access is managed through a **lockfile protocol**:

1. **Lock Acquisition**: Read lock → Check TTL → Write new lock → Verify
2. **Lock TTL**: 120 seconds (renewed every 30s while editing)
3. **Commit Pipeline**: Lock → Read → Validate → Write → Verify → Signal → Release

### 3. Search Architecture

FlexSearch is used for high-performance full-text search:

```
┌─────────────────────────────────────────────┐
│           SearchEngineService               │
├─────────────────────────────────────────────┤
│ Document Index:                             │
│  • title (weight: 100)                      │
│  • topicKeywords (weight: 85)               │
│  • topicDescription (weight: 70)            │
│  • topicNotes (weight: 55)                  │
│  • tagNames (weight: 40)                    │
│  • tagKeywords (weight: 25)                 │
│  • tagNotes (weight: 10)                    │
├─────────────────────────────────────────────┤
│ IndexMonitorService                         │
│  • Checksum-based change detection          │
│  • Automatic rebuild on data change         │
│  • Mutex for concurrent rebuilds            │
└─────────────────────────────────────────────┘
```

### 4. Error Handling

Centralized error handling via `GlobalErrorHandler`:

- Categorizes errors (runtime, navigation, http)
- Captures context (route, timestamp, version)
- Non-blocking error logging
- Development-mode stack traces

### 5. State Management

- **RxJS BehaviorSubjects** for service-level state
- **Angular Signals** for component-level reactive state
- **Observables** for async data streams

## Data Flow

### Read Flow
```
Component → BackendService.datastore$ → Display
                    ↓
         SearchEngineService.search() → Results
```

### Write Flow
```
Component → BackendService.updateTopic()
                    ↓
         DatastoreCommitService
                    ↓
         LockService.acquireLock()
                    ↓
         FileConnectionService.writeDatastore()
                    ↓
         RefreshService.signalRefresh()
```

## Routing

Hash-based routing is used for UNC path compatibility:

```typescript
provideRouter(routes, withHashLocation())
```

Routes:
- `/search` - Main search page (default)
- `/topics` - Topic management
- `/members` - Member management
- `/tags` - Tag management
- `/quick-assignment` - Bulk assignment
- `/topics-by-member` - Member view
- `/settings` - Settings
- `**` - Not found page

## Security Considerations

1. **No secrets in client** - All authentication is implicit via file share permissions
2. **Input validation** - Server-side validation via plausibility checks
3. **Sanitization** - Angular's built-in sanitization for dynamic content
4. **CSP** - Document CSP considerations for production deployment

## Performance Optimizations

1. **Lazy loading** - Feature modules can be lazy-loaded
2. **Change detection** - OnPush strategy where applicable
3. **Search indexing** - FlexSearch for O(1) lookups
4. **Debouncing** - 100ms debounce on search input
5. **Checksum caching** - Avoid unnecessary index rebuilds

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Microsoft Edge (Chromium) | ✅ Full support |
| Google Chrome | ✅ Full support |
| Firefox | ⚠️ No File System Access API |
| Safari | ⚠️ No File System Access API |

## Future Considerations

1. **Web Workers** for search indexing (large datasets)
2. **Service Workers** for offline capability
3. **REST API backend** for enterprise deployment
4. **Real-time sync** via WebSockets
