# RACI Topic Finder

A browser-only Angular 21 + PrimeNG 21 application for finding responsible persons for organizational topics using a RACI model. The application runs directly from a UNC path and uses shared JSON files on an SMB share for multi-user collaboration.

## Documentation

- [Architecture](./ARCHITECTURE.md) - System architecture and design decisions
- [UI Guide](./UI_GUIDE.md) - Component usage and styling guidelines
- [Contributing](./CONTRIBUTING.md) - Development setup and code standards

## Features

- **Browser-only**: No backend server required - runs directly from `\\server\share\app\index.html`
- **Fast search**: FlexSearch-powered topic search with German text normalization
- **Multi-user support**: Lockfile-based concurrency control for safe concurrent editing
- **RACI model**: Assign Responsible (R1/R2/R3), Consulted (C), and Informed (I) roles
- **Real-time updates**: Automatic refresh every 10 seconds when other users make changes
- **Backend abstraction**: Easy switch between File System and REST API backends
- **Irregular task planning**: P80-based estimation for tasks with variable frequency and effort

## Technology Stack

- **Angular 21** with strict TypeScript
- **PrimeNG 21** with Aura theme
- **FlexSearch** for high-performance search
- **File System Access API** for SMB file access
- **Hash-based routing** for UNC compatibility
- **Vitest** for unit testing

## Quick Start

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

## Project Structure

```
src/app/
├── core/
│   ├── models/          # Data models (Topic, TeamMember, Datastore, Lock, Refresh)
│   └── services/        # Core services (Backend, FileConnection, Lock, Refresh, SearchIndex)
├── features/
│   ├── search/          # Fast search page
│   ├── quick-assignment/# Quick assignment workflow
│   ├── topics/          # Topics management (CRUD)
│   ├── members/         # Team members management (CRUD)
│   ├── topics-by-member/# Topics filtered by team member
│   └── settings/        # Settings and diagnostics
└── shared/
    ├── components/      # Reusable components (StatusBar, UserSelectorDialog)
    └── utils/           # Utility functions
```

## Deployment

The build output is in `server/share/app/`.

### 2. Deploy to SMB Share

Copy the entire `server/share/app/` directory to your SMB share:

```
\\server\share\app\
├── browser\          # Angular application files
│   ├── index.html
│   └── ...
└── data\            # Data files (create this folder)
    ├── datastore.json
    ├── lock.json
    └── refresh.json
```

### 3. Initial Setup

1. Copy the example data files from `server/share/app/data/` to your deployment location
2. Ensure all users have read/write permissions to the `data\` folder
3. Users open the app by navigating to `\\server\share\app\browser\index.html` in Microsoft Edge

### 4. First Run

1. The app will prompt for file system permissions
2. Click "Dateien verbinden" (Connect Files)
3. Select the `data\` folder containing `datastore.json`, `lock.json`, and `refresh.json`
4. Select your identity from the "Ich bin..." dialog
5. Start searching!

## Backend Architecture

The application uses a **Backend Abstraction Layer** that allows easy switching between different storage implementations:

### Current: File System Backend

Uses the File System Access API to read/write shared JSON files on SMB:
- `datastore.json` - Topics and team members
- `lock.json` - Edit lock with 120-second TTL
- `refresh.json` - Refresh signal for other clients

### Future: REST API Backend

To switch to a REST API backend:

1. Implement your REST API endpoints
2. Update `src/app/app.config.ts`:

```typescript
// Change this line:
{ provide: BackendService, useClass: FileSystemBackendService }

// To this:
{ provide: BackendService, useClass: RestBackendService }
```

3. Configure the API base URL in `RestBackendService`
4. **No component changes needed!** All components use the `BackendService` interface.

## Concurrency Model

### Lock Protocol

- **TTL**: 120 seconds
- **Lock renewal**: Every 30 seconds while editing
- **Lock acquisition**:
  1. Read `lock.json`
  2. Check if lock is stale (age > TTL)
  3. Write new lock with current timestamp
  4. Wait 1 second
  5. Re-read and verify clientId matches
  
### Commit Pipeline

1. Acquire lock
2. Re-read datastore
3. Validate schema
4. Apply changes
5. Increment revisionId
6. Write datastore
7. Verify write (re-read and check revisionId)
8. Write refresh signal
9. Release lock

### Refresh Protocol

- Every client polls `refresh.json` every 10 seconds
- If revisionId changes, reload datastore and rebuild search index
- Current search query is preserved

## Search

The application uses **FlexSearch** for high-performance search:

- **German text normalization**: ä→ae, ö→oe, ü→ue, ß→ss
- **Priority ranking**:
  - Header exact match: 2000 points
  - Header prefix match: 1500 points
  - Header contains: 1000 points
  - Tags: 200 points
  - Keywords: 150 points
  - Description: 100 points
  - Notes: 50 points
- **Debounced search**: 100ms delay for responsive typing
- **Performance**: Optimized for 5,000+ topics

## Development

### Running Locally

```bash
npm install
npm start
```

Navigate to `http://localhost:4200/`. The app will automatically reload when you change source files.

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
```

## Troubleshooting

### File System Access Issues

**Problem**: "Failed to connect files" error

**Solutions**:
- Ensure you're using Microsoft Edge or Chrome (File System Access API)
- Check that you have read/write permissions to the SMB share
- Verify the data files exist and are valid JSON

### Lock Contention

**Problem**: "Lock is held by another user" when trying to save

**Solutions**:
- Wait for the lock to expire (shows countdown in status bar)
- Contact the lock holder if they're not actively editing
- In emergencies, manually set `lockedAt` to `1970-01-01T00:00:00Z` in `lock.json`

### UNC Path Issues

**Problem**: App doesn't load from UNC path

**Solutions**:
- Use `file://` protocol: Open Edge and enter `file://server/share/app/browser/index.html`
- Check network connectivity to the share
- Verify hash-based routing is enabled (it is by default)

### Performance Issues

**Problem**: Search is slow with many topics

**Solutions**:
- FlexSearch should handle 5,000+ topics easily
- Check browser console for errors
- Ensure search index is building correctly (check `getIndexSize()`)

## Browser Compatibility

- **Recommended**: Microsoft Edge (Chromium) on Windows 11
- **Supported**: Google Chrome on Windows/Linux
- **File System Access API**: Required for SMB file operations

## Architecture Decisions

### Backend Abstraction

The application uses a clean separation between frontend components and backend storage:

- **BackendService** (abstract): Interface defining all backend operations
- **FileSystemBackendService**: Implementation using File System Access API
- **RestBackendService**: Placeholder for future REST API implementation

**Benefits**:
- Components never directly access storage
- Easy to switch backends by changing one line in app.config.ts
- No component changes needed when switching backends
- Testable with mock backends

### Why FlexSearch?

FlexSearch was chosen for its:
- Excellent performance with large datasets (5000+ topics)
- Flexible ranking and scoring
- Support for custom text normalization (German umlauts)
- Small bundle size
- Active maintenance

## Irregular Tasks – How Planning Share Is Calculated

### Regular vs. Irregular Tasks

- **Regular tasks**: Have a constant, predictable weekly workload that doesn't vary significantly
- **Irregular tasks**: Occur at unpredictable intervals with varying effort (e.g., incident responses, ad-hoc projects)

### P80 Planning Explained

The application uses **P80 estimation** to convert irregular tasks into stable weekly planning shares:

- **P80** means the 80th percentile estimate – values that won't be exceeded 80% of the time
- This provides a realistic planning buffer without excessive over-provisioning
- Formula: `P80 = Typical + k × (Max - Typical)` where k depends on variance class

### Planning Load vs. Peak Load

| Metric | Purpose | Used In |
|--------|---------|---------|
| **Weekly Planning Hours** | Regular capacity allocation | Member workload calculation |
| **Weekly Peak Hours** | Risk assessment | Overload analysis only |

- **Planning hours** are automatically added to member workload
- **Peak hours** show worst-case scenarios but are NOT added to total load

### Variance Classes (L0–L4)

| Class | Description | P80 Weight (k) |
|-------|-------------|----------------|
| L0 | Very stable, predictable | 0.40 |
| L1 | Low variability | 0.50 |
| L2 | Medium variability (default) | 0.60 |
| L3 | High variability | 0.75 |
| L4 | Extreme uncertainty | 0.90 |

Use higher variance classes when:
- Task duration varies significantly
- Historical data shows wide spread
- External dependencies cause unpredictability

### Wave Classes (W0–W4)

| Class | Description | Peak Multiplier (w) |
|-------|-------------|---------------------|
| W0 | Evenly spread throughout year | 1.0× |
| W1 | Slightly clustered | 1.5× |
| W2 | Clustered (default) | 2.0× |
| W3 | Strongly clustered | 3.0× |
| W4 | Extreme bursts | 4.0× |

Use higher wave classes when:
- Events tend to cluster (e.g., end-of-quarter, holidays)
- Multiple instances can occur simultaneously
- Peak periods are significantly different from average

### Example Calculation

**Scenario**: Support incidents
- Frequency: 5–10–20 per year (min/typical/max)
- Effort: 2–4–8 hours per incident (min/typical/max)
- Variance: L2 (medium)
- Wave: W2 (clustered)

**Calculation**:
1. k = 0.60 (from L2)
2. N_P80 = 10 + 0.60 × (20 - 10) = 16 events/year
3. T_P80 = 4 + 0.60 × (8 - 4) = 6.4 hours/event
4. Yearly hours = 16 × 6.4 = 102.4 hours
5. Weekly planning = 102.4 / 52 = **1.97 h/week**
6. Weekly peak = 2.0 × 1.97 = **3.94 h/week** (for risk analysis)

## License

This project is for internal organizational use.

## Support

For questions or issues, contact your IT department or the application maintainer.
