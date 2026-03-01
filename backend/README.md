# RACI Backend

Zero-knowledge Rust backend for the RACI Topic Assistant with end-to-end encryption.

## Features

- **Zero-knowledge architecture**: All data is encrypted client-side with PSK
- **Multi-instance support**: Each instance has its own database namespace
- **API key authentication**: Secure access control per instance
- **libmdbx storage**: Fast, ACID-compliant embedded database
- **REST API**: Standard HTTP endpoints for CRUD operations

## Architecture

```
┌─────────────┐         Encrypted Data          ┌──────────────┐
│   Angular   │  ◄────────────────────────────► │ Rust Backend │
│  Frontend   │         (AES-GCM 256)           │  (libmdbx)   │
└─────────────┘                                  └──────────────┘
      │                                                 │
      │ PSK (never sent)                               │
      │                                                 │
      └─ Encrypts locally                             └─ Stores encrypted
```

## Getting Started

### Prerequisites

- Rust 1.75 or later
- Cargo

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd backend

# Copy environment configuration
cp .env.example .env

# Build the project
cargo build --release

# Run tests
cargo test

# Start the server
cargo run --release
```

The server will start on `http://127.0.0.1:3000` by default.

## Configuration

Edit `.env` to configure:

```env
DATABASE_PATH=./data/mdbx  # Database storage path
HOST=127.0.0.1             # Server bind address
PORT=3000                  # Server port
RUST_LOG=info              # Log level
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server status and version.

### Get Datastore

```
GET /instances/:instance_id/datastore
Headers:
  Authorization: Bearer <api-key>
  X-Instance-Id: <instance-id>
```

Returns the encrypted datastore for the instance.

### Get Revision

```
GET /instances/:instance_id/revision
Headers:
  Authorization: Bearer <api-key>
  X-Instance-Id: <instance-id>
```

Returns the current revision ID for change detection.

### CRUD Operations

All CRUD operations accept encrypted payloads:

```
POST   /topics              # Create topic
PATCH  /topics/:id          # Update topic
DELETE /topics/:id          # Delete topic
PATCH  /topics/batch        # Batch update topics

POST   /members             # Create member
PATCH  /members/:id         # Update member
DELETE /members/:id         # Delete member

POST   /tags                # Create tag
PATCH  /tags/:id            # Update tag
DELETE /tags/:id            # Delete tag
```

All endpoints require:
- `Authorization: Bearer <api-key>` header
- `X-Instance-Id: <instance-id>` header
- Request body: `EncryptedPayload` JSON

## Encrypted Payload Format

```json
{
  "ciphertext": "base64-encoded-ciphertext",
  "iv": "base64-encoded-iv",
  "tag": "base64-encoded-auth-tag",
  "version": 1
}
```

## Instance Setup

To create a new instance:

1. Generate a unique instance ID (UUID)
2. Generate a secure API key
3. Generate a secure PSK (16+ characters)
4. Hash the API key and store instance metadata in database

Example using Rust:

```rust
use raci_backend::{Database, Instance, hash_api_key};

let db = Database::new("./data/mdbx")?;

let instance = Instance {
    instance_id: "my-instance-id".to_string(),
    api_key_hash: hash_api_key("my-secret-api-key"),
    created_at: chrono::Utc::now().to_rfc3339(),
    updated_at: chrono::Utc::now().to_rfc3339(),
    revision_id: 0,
};

db.store_instance(&instance)?;
```

## Security

- **E2E Encryption**: Data is encrypted client-side with AES-GCM-256
- **Zero Knowledge**: Backend never has access to PSK or plaintext data
- **API Key Auth**: All endpoints require valid API key
- **Instance Isolation**: Each instance has isolated storage
- **HTTPS**: Use HTTPS in production (configure reverse proxy)

## Development

```bash
# Run in development mode with auto-reload
cargo watch -x run

# Run tests with coverage
cargo tarpaulin --out Html

# Lint and format
cargo clippy
cargo fmt
```

## Production Deployment

1. Build release binary:
   ```bash
   cargo build --release
   ```

2. Set up systemd service or Docker container

3. Configure reverse proxy (nginx/caddy) for HTTPS

4. Set production environment variables

5. Back up database directory regularly

## License

Internal use only.
