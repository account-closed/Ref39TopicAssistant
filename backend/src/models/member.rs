//! Team member model matching the frontend TeamMember interface.

use serde::{Deserialize, Serialize};

/// A team member who can be assigned to topics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub updated_at: String,
    /// Internal version for optimistic concurrency control
    #[serde(default)]
    pub version: i64,
}

/// Request body for creating a new team member.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemberRequest {
    pub display_name: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub color: Option<String>,
}

fn default_active() -> bool {
    true
}

/// Request body for updating an existing team member.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemberRequest {
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub color: Option<String>,
    /// Expected version for optimistic concurrency control
    #[serde(default)]
    pub expected_version: Option<i64>,
}
