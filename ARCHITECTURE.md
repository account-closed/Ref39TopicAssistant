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

## Dependencies

### Runtime Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `@angular/core` | Core Angular framework | Dependency injection, change detection, components |
| `@angular/router` | Client-side routing | Hash-based routing for UNC compatibility |
| `@angular/forms` | Form handling | Template-driven and reactive forms |
| `@angular/animations` | UI animations | PrimeNG animations support |
| `primeng` | UI component library | Tables, dialogs, buttons, etc. |
| `@primeng/themes` | Theming system | Aura theme with dark mode support |
| `primeicons` | Icon library | Icons for UI components |
| `flexsearch` | Full-text search | High-performance client-side search |
| `@ngneat/hotkeys` | Keyboard shortcuts | Ctrl+Shift+C, arrow navigation, etc. |
| `rxjs` | Reactive programming | Observables, BehaviorSubjects |
| `tslib` | TypeScript helpers | Runtime helpers for compiled TypeScript |

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `@angular/cli` | CLI tooling for Angular |
| `@angular/build` | Build system (esbuild-based) |
| `typescript` | TypeScript compiler |
| `eslint` | Code linting |
| `vitest` | Unit testing framework |
| `jsdom` | DOM simulation for tests |

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

## Data Model

The application uses a document-based data model stored in JSON files. Below are the complete data structures.

### Datastore (Root Object)

The main data file (`datastore.json`) containing all application data.

```typescript
interface Datastore {
  schemaVersion: number;      // Schema version for migrations (currently: 1)
  generatedAt: string;        // ISO timestamp of last save
  revisionId: number;         // Incremented on each save (for change detection)
  members: TeamMember[];      // All team members
  topics: Topic[];            // All topics
  tags?: Tag[];               // Managed tags (optional)
}
```

### Topic

Topics are the core entities representing organizational responsibilities.

```typescript
interface Topic {
  id: string;                 // UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")
  header: string;             // Topic title/name (required)
  description?: string;       // Detailed description
  tags?: string[];            // Array of tag IDs or tag names
  searchKeywords?: string[];  // Additional search terms
  validity: TopicValidity;    // Time-based validity
  notes?: string;             // Internal notes
  raci: TopicRaci;            // RACI responsibility matrix
  updatedAt: string;          // ISO timestamp of last update
  priority?: number;          // Priority rating (1-10)
  hasFileNumber?: boolean;    // Whether topic has a file reference
  fileNumber?: string;        // File reference number (e.g., "AZ-2024-001")
  hasSharedFilePath?: boolean;// Whether topic has a shared file location
  sharedFilePath?: string;    // UNC path or shared folder location
  size?: TShirtSize;          // Effort estimation (XXS-XXL)
}

interface TopicValidity {
  alwaysValid: boolean;       // If true, ignore date range
  validFrom?: string;         // ISO date (YYYY-MM-DD)
  validTo?: string;           // ISO date (YYYY-MM-DD)
}

interface TopicRaci {
  r1MemberId: string;         // Primary responsible (required)
  r2MemberId?: string;        // First backup
  r3MemberId?: string;        // Second backup
  cMemberIds: string[];       // Consulted members (array of member IDs)
  iMemberIds: string[];       // Informed members (array of member IDs)
}

type TShirtSize = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
```

### TeamMember

Users who can be assigned to topics.

```typescript
interface TeamMember {
  id: string;                 // UUID
  displayName: string;        // Full name for display
  email?: string;             // Email address
  active: boolean;            // Whether member is currently active
  tags?: string[];            // Member categorization tags
  color?: string;             // Hex color code (e.g., "#FF5733")
  updatedAt: string;          // ISO timestamp
}
```

### Tag

Reusable tags for categorizing topics.

```typescript
interface Tag {
  id: string;                 // UUID
  name: string;               // Tag display name (required)
  searchKeywords?: string[];  // Additional search terms
  hinweise?: string;          // Notes/tips shown in search results
  copyPasteText?: string;     // Pre-formatted text for clipboard
  color?: string;             // Hex color code (e.g., "#4CAF50")
  isSuperTag?: boolean;       // Top-level category tag
  isGvplTag?: boolean;        // Business distribution plan tag
  createdAt: string;          // ISO timestamp
  modifiedAt: string;         // ISO timestamp
  createdBy: string;          // Member ID of creator
}
```

### Lock (Concurrency Control)

File-based locking for multi-user write access (`lock.json`).

```typescript
interface Lock {
  lockedAt: string;           // ISO timestamp (UTC) when lock was acquired
  ttlSeconds: number;         // Time-to-live in seconds (default: 120)
  lockedBy: LockHolder;       // Who holds the lock
  clientId: string;           // UUID identifying the browser instance
  purpose: LockPurpose;       // What operation the lock is for
}

interface LockHolder {
  memberId: string;           // UUID of the member
  displayName: string;        // Name for display in UI
}

type LockPurpose = 'topic-save' | 'member-save' | 'assignment-save' | 'tag-save';
```

### RefreshSignal (Multi-Client Sync)

Signal file for notifying other clients of changes (`refresh.json`).

```typescript
interface RefreshSignal {
  revisionId: number;         // Matches datastore.revisionId after save
  ts: string;                 // ISO timestamp of the change
  by: {
    memberId: string;         // Who made the change
    displayName: string;      // Name for display
  };
}
```

## Entity Relationships

```
┌──────────────┐         ┌──────────────┐
│    Topic     │ ──────> │  TeamMember  │
│              │  RACI   │              │
│  • r1MemberId│         │  • id        │
│  • r2MemberId│         │  • displayName│
│  • r3MemberId│         │  • email     │
│  • cMemberIds│         │  • active    │
│  • iMemberIds│         └──────────────┘
│              │
│  • tags[]    │ ──────> ┌──────────────┐
└──────────────┘         │     Tag      │
                         │  • id        │
                         │  • name      │
                         │  • color     │
                         └──────────────┘
```

## REST API Contract (Future Backend)

For implementing a REST backend, the following endpoints should be provided:

### Datastore Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/datastore` | Get full datastore |
| `GET` | `/api/datastore/revision` | Get current revision ID |

### Topic Operations

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| `GET` | `/api/topics` | List all topics | - |
| `GET` | `/api/topics/:id` | Get single topic | - |
| `POST` | `/api/topics` | Create topic | `Topic` (without id, updatedAt) |
| `PUT` | `/api/topics/:id` | Update topic | `Partial<Topic>` |
| `DELETE` | `/api/topics/:id` | Delete topic | - |
| `PUT` | `/api/topics/batch` | Batch update | `{ updates: [{topicId, changes}] }` |

### Member Operations

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| `GET` | `/api/members` | List all members | - |
| `GET` | `/api/members/:id` | Get single member | - |
| `POST` | `/api/members` | Create member | `TeamMember` (without id, updatedAt) |
| `PUT` | `/api/members/:id` | Update member | `Partial<TeamMember>` |
| `DELETE` | `/api/members/:id` | Delete member | - |

### Tag Operations

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| `GET` | `/api/tags` | List all tags | - |
| `POST` | `/api/tags` | Create tag | `Tag` (without id, timestamps) |
| `PUT` | `/api/tags/:id` | Update tag | `Partial<Tag>` |
| `DELETE` | `/api/tags/:id` | Delete tag | - |

### Lock Operations (Optional)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/lock` | Get current lock status |
| `POST` | `/api/lock/acquire` | Acquire lock |
| `POST` | `/api/lock/release` | Release lock |
| `POST` | `/api/lock/renew` | Renew lock TTL |

### Response Format

All responses should follow this structure:

```typescript
// Success response
{
  "success": true,
  "data": <entity or array>,
  "revisionId": number
}

// Error response
{
  "success": false,
  "error": {
    "code": string,
    "message": string,
    "details"?: object
  }
}
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
