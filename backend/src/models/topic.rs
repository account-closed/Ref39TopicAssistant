//! Topic model matching the frontend Topic interface.

use serde::{Deserialize, Serialize};

/// T-shirt size classification for effort estimation.
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TShirtSize {
    XXS,
    XS,
    S,
    M,
    L,
    XL,
    XXL,
}

impl TShirtSize {
    pub fn as_str(&self) -> &'static str {
        match self {
            TShirtSize::XXS => "XXS",
            TShirtSize::XS => "XS",
            TShirtSize::S => "S",
            TShirtSize::M => "M",
            TShirtSize::L => "L",
            TShirtSize::XL => "XL",
            TShirtSize::XXL => "XXL",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "XXS" => Some(TShirtSize::XXS),
            "XS" => Some(TShirtSize::XS),
            "S" => Some(TShirtSize::S),
            "M" => Some(TShirtSize::M),
            "L" => Some(TShirtSize::L),
            "XL" => Some(TShirtSize::XL),
            "XXL" => Some(TShirtSize::XXL),
            _ => None,
        }
    }
}

/// Time-based validity for a topic.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicValidity {
    pub always_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_to: Option<String>,
}

impl Default for TopicValidity {
    fn default() -> Self {
        Self {
            always_valid: true,
            valid_from: None,
            valid_to: None,
        }
    }
}

/// RACI responsibility matrix for a topic.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TopicRaci {
    #[serde(default)]
    pub r1_member_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r2_member_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r3_member_id: Option<String>,
    #[serde(default)]
    pub c_member_ids: Vec<String>,
    #[serde(default)]
    pub i_member_ids: Vec<String>,
}

/// A topic representing organizational responsibilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Topic {
    pub id: String,
    pub header: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_keywords: Option<Vec<String>>,
    pub validity: TopicValidity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub raci: TopicRaci,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_file_number: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_shared_file_path: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<TShirtSize>,
    /// Internal version for optimistic concurrency control
    #[serde(default)]
    pub version: i64,
}

/// Request body for creating a new topic.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTopicRequest {
    pub header: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub search_keywords: Option<Vec<String>>,
    #[serde(default)]
    pub validity: Option<TopicValidity>,
    #[serde(default)]
    pub notes: Option<String>,
    pub raci: TopicRaci,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub has_file_number: Option<bool>,
    #[serde(default)]
    pub file_number: Option<String>,
    #[serde(default)]
    pub has_shared_file_path: Option<bool>,
    #[serde(default)]
    pub shared_file_path: Option<String>,
    #[serde(default)]
    pub size: Option<TShirtSize>,
}

/// Request body for updating an existing topic.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTopicRequest {
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub search_keywords: Option<Vec<String>>,
    #[serde(default)]
    pub validity: Option<TopicValidity>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub raci: Option<TopicRaci>,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub has_file_number: Option<bool>,
    #[serde(default)]
    pub file_number: Option<String>,
    #[serde(default)]
    pub has_shared_file_path: Option<bool>,
    #[serde(default)]
    pub shared_file_path: Option<String>,
    #[serde(default)]
    pub size: Option<TShirtSize>,
    /// Expected version for optimistic concurrency control
    #[serde(default)]
    pub expected_version: Option<i64>,
}

/// Request body for batch updating topics.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUpdateTopicsRequest {
    pub updates: Vec<BatchTopicUpdate>,
}

/// Single topic update in a batch operation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTopicUpdate {
    pub topic_id: String,
    pub changes: UpdateTopicRequest,
}
