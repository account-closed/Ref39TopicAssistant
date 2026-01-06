//! Datastore model matching the frontend Datastore interface.

use serde::{Deserialize, Serialize};

use super::{Tag, TeamMember, Topic};

/// The root datastore containing all application data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Datastore {
    pub schema_version: i32,
    pub generated_at: String,
    pub revision_id: i64,
    pub members: Vec<TeamMember>,
    pub topics: Vec<Topic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
}

/// Revision information for change detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionInfo {
    pub revision_id: i64,
    pub generated_at: String,
}
