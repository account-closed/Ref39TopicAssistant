# RACI Topic Finder Backend

A production-grade REST backend for the RACI Topic Finder application, built with Rust.

## Features

- **SQLite persistence** - All data stored in SQLite as the source of truth
- **Tantivy full-text search** - Fast, in-process search with field boosting
- **PSK authentication** - Pre-shared key authentication with constant-time comparison
- **Optimistic concurrency** - Version-based conflict detection for safe concurrent updates
- **Response envelopes** - Consistent API response format with success/error states
- **Comprehensive tests** - Integration tests covering all endpoints

## Quick Start

### Prerequisites

- Rust 1.70+ (install from [rustup.rs](https://rustup.rs))

### Running Locally

1. **Build the project:**
   ```bash
   cd backend
   cargo build --release
   ```

2. **Set environment variables (optional):**
   ```bash
   # API authentication (recommended for production)
   export RACI_API_PSK="your-secret-key"
   
   # Database path (default: ./data/app.sqlite)
   export RACI_DB_PATH="./data/app.sqlite"
   
   # Search index path (default: ./data/index)
   export RACI_INDEX_PATH="./data/index"
   
   # Server bind address (default: 127.0.0.1:8080)
   export RACI_BIND_ADDR="127.0.0.1:8080"
   
   # Log level (default: info)
   export RACI_LOG_LEVEL="info"
   ```

3. **Run the server:**
   ```bash
   cargo run --release
   ```

4. **Test the API:**
   ```bash
   # Health check (no auth required)
   curl http://localhost:8080/health
   
   # Get datastore (with auth)
   curl -H "X-API-Key: your-secret-key" http://localhost:8080/api/datastore
   ```

### Running Tests

```bash
cd backend
cargo test
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RACI_API_PSK` | Pre-shared key for API authentication | None (auth disabled) |
| `RACI_DB_PATH` | Path to SQLite database file | `./data/app.sqlite` |
| `RACI_INDEX_PATH` | Path to Tantivy search index | `./data/index` |
| `RACI_BIND_ADDR` | Server bind address | `127.0.0.1:8080` |
| `RACI_LOG_LEVEL` | Log level (trace/debug/info/warn/error) | `info` |

## API Endpoints

All `/api/*` endpoints require authentication via the `X-API-Key` header (or `Authorization: Bearer <key>`).

### Datastore

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/datastore` | Get full datastore |
| GET | `/api/datastore/revision` | Get current revision info |

### Topics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/topics` | List all topics |
| GET | `/api/topics/:id` | Get single topic |
| POST | `/api/topics` | Create topic |
| PUT | `/api/topics/:id` | Update topic |
| DELETE | `/api/topics/:id` | Delete topic |
| PUT | `/api/topics/batch` | Batch update topics |

### Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/members` | List all members |
| GET | `/api/members/:id` | Get single member |
| POST | `/api/members` | Create member |
| PUT | `/api/members/:id` | Update member |
| DELETE | `/api/members/:id` | Delete member |

### Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create tag |
| PUT | `/api/tags/:id` | Update tag |
| DELETE | `/api/tags/:id` | Delete tag |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...&limit=...&offset=...` | Search topics |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth) |

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "revisionId": 123
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }
  },
  "revisionId": 123
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `VERSION_MISMATCH` | 409 | Optimistic concurrency conflict |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `SEARCH_ERROR` | 500 | Search operation failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Optimistic Concurrency

Entities (Topic, Member, Tag) have a `version` field that increments on each update. To prevent lost updates, include `expectedVersion` in update requests:

```json
PUT /api/members/abc-123
{
  "displayName": "Updated Name",
  "expectedVersion": 1
}
```

If the version doesn't match, you'll receive a `409 Conflict` response:

```json
{
  "success": false,
  "error": {
    "code": "VERSION_MISMATCH",
    "message": "Version mismatch: expected 1, current 2",
    "details": { "currentVersion": 2 }
  },
  "revisionId": 123
}
```

## Search

The search endpoint uses Tantivy for full-text search with field boosting:

| Field | Boost |
|-------|-------|
| Header | 10.0 |
| Keywords | 8.5 |
| Description | 7.0 |
| Notes | 5.5 |
| Tag names | 4.0 |
| Tag keywords | 2.5 |

Example search:

```bash
curl -H "X-API-Key: secret" "http://localhost:8080/api/search?q=password+reset&limit=10"
```

## Connecting the Frontend

1. **Configure the frontend API base URL:**
   
   In your Angular app, set the REST backend URL:
   ```typescript
   // In rest-backend.service.ts
   private apiBaseUrl: string = 'http://localhost:8080/api';
   ```

2. **Add the API key header:**
   ```typescript
   const headers = { 'X-API-Key': 'your-secret-key' };
   ```

3. **Switch to REST backend:**
   ```typescript
   // In app.config.ts
   { provide: BackendService, useClass: RestBackendService }
   ```

## Development

### Code Style

```bash
# Format code
cargo fmt

# Check lints
cargo clippy
```

### Project Structure

```
backend/
├── Cargo.toml          # Dependencies
├── README.md           # This file
├── src/
│   ├── main.rs         # Entry point and router
│   ├── api/            # API handlers
│   │   ├── datastore.rs
│   │   ├── members.rs
│   │   ├── tags.rs
│   │   ├── topics.rs
│   │   └── search.rs
│   ├── auth/           # Authentication
│   ├── config/         # Configuration
│   ├── db/             # Database layer
│   │   ├── mod.rs      # DB init and migrations
│   │   └── repository.rs
│   ├── errors/         # Error handling
│   ├── models/         # Data models
│   │   ├── datastore.rs
│   │   ├── member.rs
│   │   ├── tag.rs
│   │   └── topic.rs
│   ├── search/         # Tantivy search
│   └── tests.rs        # Integration tests
└── data/               # Runtime data (created automatically)
    ├── app.sqlite      # SQLite database
    └── index/          # Tantivy search index
```

## License

MIT
