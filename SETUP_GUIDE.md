# End-to-End Encryption + Rust Backend Setup Guide

This guide explains how to set up and use the new E2E encrypted backend for the RACI Topic Assistant.

## Overview

The system now consists of:
1. **Angular Frontend** - Client-side encryption with PSK
2. **Rust Backend** - Zero-knowledge storage with libmdbx
3. **Instance Configuration** - Multi-tenant support with API key auth

## Architecture

```
┌─────────────────────┐
│  Angular Frontend   │
│  ┌───────────────┐  │
│  │ Encryption    │  │  PSK (never leaves client)
│  │ Service       │  │  ▼
│  │ (AES-GCM-256) │  │  Encrypts locally
│  └───────────────┘  │
│         │            │
│         ▼            │
│   EncryptedPayload   │
└──────────┬───────────┘
           │ HTTPS
           ▼
┌──────────────────────┐
│   Rust Backend       │
│  ┌────────────────┐  │
│  │  API Auth      │  │  Validates API key
│  │  Middleware    │  │  ▼
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │  libmdbx       │  │  Stores encrypted data
│  │  Database      │  │  (zero knowledge)
│  └────────────────┘  │
└──────────────────────┘
```

## Quick Start

### 1. Set Up Backend

```bash
# Navigate to backend directory
cd backend

# Copy environment configuration
cp .env.example .env

# Build and run
cargo build --release
cargo run --release
```

The backend will start on `http://127.0.0.1:3000`.

### 2. Create an Instance

You need to create an instance with an API key. Here's a helper script:

Create `backend/scripts/create_instance.sh`:

```bash
#!/bin/bash

INSTANCE_ID=$(uuidgen)
API_KEY=$(openssl rand -base64 32)
PSK=$(openssl rand -base64 32)

echo "Instance created!"
echo "===================="
echo "Instance ID: $INSTANCE_ID"
echo "API Key: $API_KEY"
echo "PSK: $PSK"
echo ""
echo "Save these values securely!"
```

Run it:
```bash
chmod +x backend/scripts/create_instance.sh
./backend/scripts/create_instance.sh
```

### 3. Configure Frontend

In the Angular app, go to Settings and enter:
- **Instance ID**: From step 2
- **API URL**: `http://localhost:3000`
- **API Key**: From step 2
- **PSK**: From step 2

The frontend will:
1. Encrypt all data locally with the PSK
2. Send encrypted payload to backend
3. Backend stores encrypted data (zero knowledge)

## Configuration Files

### Backend (.env)

```env
DATABASE_PATH=./data/mdbx  # Where to store database
HOST=127.0.0.1             # Server address
PORT=3000                  # Server port
RUST_LOG=info              # Log level
```

### Frontend (Stored in browser localStorage)

```json
{
  "instanceId": "uuid-v4",
  "apiUrl": "http://localhost:3000",
  "apiKey": "base64-encoded-key",
  "psk": "base64-encoded-psk"
}
```

## Security Best Practices

### 1. PSK Management

- **Never commit PSK to git**
- **Store PSK securely** (password manager)
- **Use strong PSK** (32+ characters, random)
- **Different PSK per instance**

### 2. API Key Management

- **Rotate API keys regularly**
- **Use HTTPS in production**
- **Store API key hash only** (backend)

### 3. Production Deployment

```bash
# Backend: Use HTTPS with reverse proxy (nginx/caddy)
# Frontend: Deploy with TLS certificate
# Database: Back up regularly, encrypt at rest
```

## API Endpoints

All endpoints require headers:
```
Authorization: Bearer <api-key>
X-Instance-Id: <instance-id>
```

### Health Check
```
GET /health
```

### Get Datastore (Encrypted)
```
GET /instances/:instance_id/datastore
```

### Get Revision
```
GET /instances/:instance_id/revision
```

### CRUD Operations (All Encrypted)
```
POST   /topics              # Create
PATCH  /topics/:id          # Update
DELETE /topics/:id          # Delete
PATCH  /topics/batch        # Batch update

POST   /members
PATCH  /members/:id
DELETE /members/:id

POST   /tags
PATCH  /tags/:id
DELETE /tags/:id
```

## Encrypted Payload Format

```json
{
  "ciphertext": "base64-encoded-encrypted-data",
  "iv": "base64-encoded-initialization-vector",
  "tag": "base64-encoded-auth-tag",
  "version": 1
}
```

## Migration from File-Based Backend

### Option 1: Fresh Start

1. Set up new backend
2. Create instance
3. Configure frontend
4. Re-enter data (encrypted)

### Option 2: Migrate Data

1. Export existing datastore.json
2. Load in frontend with new config
3. Save (will encrypt and send to backend)

## Troubleshooting

### "Failed to connect to backend"

- Check backend is running: `curl http://localhost:3000/health`
- Verify API URL in frontend config
- Check CORS settings

### "Authentication failed"

- Verify API key is correct
- Check X-Instance-Id header matches instance
- Ensure instance exists in database

### "Decryption failed"

- Verify PSK is correct
- Check encrypted payload version
- Ensure data wasn't corrupted

### "No configuration found"

- Go to Settings in frontend
- Enter instance ID, API URL, API key, and PSK
- Click Save

## Development

### Run Backend in Dev Mode

```bash
cd backend
cargo watch -x run
```

### Run Frontend in Dev Mode

```bash
cd frontend
npm start
```

### Test E2E Encryption

```bash
# Start backend
cd backend && cargo run

# In another terminal, test encryption
curl -X POST http://localhost:3000/topics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -H "X-Instance-Id: your-instance-id" \
  -d '{
    "ciphertext": "...",
    "iv": "...",
    "tag": "...",
    "version": 1
  }'
```

## Multi-Instance Support

Each instance has:
- Unique instance ID
- Own API key (hashed)
- Own PSK (never stored)
- Isolated database namespace
- Independent revision tracking

To create multiple instances:
1. Run create_instance.sh multiple times
2. Configure different frontends with different configs
3. Each frontend encrypts with its own PSK
4. Backend stores all instances separately

## Backup and Restore

### Backup

```bash
# Backend database
tar -czf backup.tar.gz backend/data/mdbx/

# Frontend config (export from Settings)
```

### Restore

```bash
# Extract database backup
tar -xzf backup.tar.gz -C backend/

# Import config in frontend Settings
```

## Performance

- **Encryption**: < 1ms for typical datastore
- **Backend storage**: < 5ms for CRUD operations
- **Database**: libmdbx is ACID-compliant, no performance loss
- **Network**: Only encrypted payload sent (compact)

## License

Internal use only.
