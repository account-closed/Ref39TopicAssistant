# Backend Migration Guide

This document explains how to switch from the File System backend to a REST API backend with minimal effort.

## Architecture Overview

The application uses a **Backend Abstraction Layer** that completely decouples the frontend from the storage implementation:

```
Components → BackendService (interface) → Implementation
                                         ├─ FileSystemBackendService
                                         └─ RestBackendService
```

## Current Implementation

**File System Backend** (`FileSystemBackendService`):
- Uses File System Access API
- Reads/writes JSON files on SMB share
- Implements lockfile-based concurrency
- Perfect for small teams without infrastructure

## Switching to REST API

### Step 1: Implement Your REST API

Create a backend server with these endpoints:

```
GET    /api/datastore              - Get current datastore
POST   /api/topics                 - Create topic
PATCH  /api/topics/{id}            - Update topic
DELETE /api/topics/{id}            - Delete topic
POST   /api/members                - Create member
PATCH  /api/members/{id}           - Update member
DELETE /api/members/{id}           - Delete member
PATCH  /api/topics/batch           - Batch update topics
GET    /api/health                 - Health check
```

### Step 2: Configure REST Backend Service

Update `src/app/core/services/rest-backend.service.ts`:

```typescript
private apiBaseUrl: string = 'https://your-api.example.com/api';
```

Implement the placeholder methods with actual HTTP calls:

```typescript
async addTopic(topic: Topic): Promise<boolean> {
  try {
    const response = await fetch(`${this.apiBaseUrl}/topics`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify(topic)
    });
    
    if (response.ok) {
      await this.loadDatastore();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to add topic:', error);
    return false;
  }
}
```

### Step 3: Switch Backend in Configuration

Edit `src/app/app.config.ts`:

```typescript
// Before (File System):
{ provide: BackendService, useClass: FileSystemBackendService }

// After (REST API):
{ provide: BackendService, useClass: RestBackendService }
```

### Step 4: Rebuild and Deploy

```bash
npm run build
```

That's it! **No component changes needed.**

## What Stays the Same

✅ All components continue to work unchanged
✅ SearchIndexService still builds in-memory index
✅ UI remains identical
✅ User workflows unchanged

## What Changes

❌ No File System Access API permissions needed
❌ No lockfile management (server handles concurrency)
❌ No manual refresh polling (server can push updates)
✅ Centralized data management
✅ Better security and access control
✅ Audit logging on server
✅ Backup and disaster recovery

## Hybrid Approach

You can even support both backends simultaneously:

```typescript
// In app.config.ts
const useRestBackend = environment.production;

{
  provide: BackendService,
  useClass: useRestBackend ? RestBackendService : FileSystemBackendService
}
```

## Testing the Switch

1. Create a test REST API with mock data
2. Update `RestBackendService` configuration
3. Change provider in `app.config.ts`
4. Build and test locally
5. Verify all CRUD operations work
6. Deploy to production

## Benefits of Backend Abstraction

- **Zero component changes** when switching backends
- **Easy testing** with mock backends
- **Flexible deployment** (file-based or REST)
- **Future-proof** architecture
- **Clean separation** of concerns

## Support

For assistance with backend migration, contact the development team.
