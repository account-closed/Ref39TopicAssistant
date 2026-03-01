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

    // Atomic entity keys
    pub fn topic_key(instance_id: &str, topic_id: &str) -> String {
        format!("topic:{}:{}", instance_id, topic_id)
    }

    pub fn tag_key(instance_id: &str, tag_id: &str) -> String {
        format!("tag:{}:{}", instance_id, tag_id)
    }

    pub fn member_key(instance_id: &str, member_id: &str) -> String {
        format!("member:{}:{}", instance_id, member_id)
    }

    // Change event keys
    pub fn change_event_key(instance_id: &str, revision_id: u64) -> String {
        format!("change:{}:{:020}", instance_id, revision_id)
    }

    // List prefixes for scanning
    pub fn topics_prefix(instance_id: &str) -> String {
        format!("topic:{}:", instance_id)
    }

    pub fn tags_prefix(instance_id: &str) -> String {
        format!("tag:{}:", instance_id)
    }

    pub fn members_prefix(instance_id: &str) -> String {
        format!("member:{}:", instance_id)
    }

    pub fn changes_prefix(instance_id: &str) -> String {
        format!("change:{}:", instance_id)
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

/// Change event type for notifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeEventType {
    Create,
    Update,
    Delete,
}

/// Entity type for change notifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityType {
    Topic,
    Tag,
    Member,
}

/// Change event for notifying clients about data changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeEvent {
    pub entity_type: EntityType,
    pub entity_id: String,
    pub event_type: ChangeEventType,
    pub revision_id: u64,
    pub timestamp: String, // ISO 8601
    pub by_member_id: Option<String>,
}

/// Response containing change events since a given revision.
#[derive(Debug, Serialize)]
pub struct ChangesResponse {
    pub changes: Vec<ChangeEvent>,
    pub current_revision: u64,
}
