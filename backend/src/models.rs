use serde::{Deserialize, Serialize};

/// Encrypted payload from the frontend (zero-knowledge).
/// Backend stores this as-is without decryption.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub iv: String,
    pub tag: String,
    pub version: u32,
}

/// Instance metadata stored in database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub instance_id: String,
    pub api_key_hash: String, // Hashed API key for authentication
    pub created_at: String,
    pub updated_at: String,
    pub revision_id: u64,
}

/// Database keys for different data types.
pub struct DbKeys;

impl DbKeys {
    pub const INSTANCES: &'static str = "instances";

    pub fn instance_key(instance_id: &str) -> String {
        format!("instance:{}", instance_id)
    }

    pub fn datastore_key(instance_id: &str) -> String {
        format!("datastore:{}", instance_id)
    }

    pub fn revision_key(instance_id: &str) -> String {
        format!("revision:{}", instance_id)
    }
}

/// API response for health check.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

/// API response for revision check.
#[derive(Debug, Serialize)]
pub struct RevisionResponse {
    pub revision_id: u64,
}

/// Generic success response.
#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// Generic error response.
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}
