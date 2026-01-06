//! Tag model matching the frontend Tag interface.

use serde::{Deserialize, Serialize};

/// A reusable tag for categorizing topics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_keywords: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hinweise: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copy_paste_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_super_tag: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_gvpl_tag: Option<bool>,
    pub created_at: String,
    pub modified_at: String,
    pub created_by: String,
    /// Internal version for optimistic concurrency control
    #[serde(default)]
    pub version: i64,
}

/// Request body for creating a new tag.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagRequest {
    pub name: String,
    #[serde(default)]
    pub search_keywords: Option<Vec<String>>,
    #[serde(default)]
    pub hinweise: Option<String>,
    #[serde(default)]
    pub copy_paste_text: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub is_super_tag: Option<bool>,
    #[serde(default)]
    pub is_gvpl_tag: Option<bool>,
    /// Member ID of the creator
    pub created_by: String,
}

/// Request body for updating an existing tag.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub search_keywords: Option<Vec<String>>,
    #[serde(default)]
    pub hinweise: Option<String>,
    #[serde(default)]
    pub copy_paste_text: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub is_super_tag: Option<bool>,
    #[serde(default)]
    pub is_gvpl_tag: Option<bool>,
    /// Expected version for optimistic concurrency control
    #[serde(default)]
    pub expected_version: Option<i64>,
}
