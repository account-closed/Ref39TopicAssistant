//! Error handling module for the RACI backend.
//!
//! Provides centralized error types with mapping to HTTP status codes and response envelopes.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

/// Error codes as constants to avoid stringly-typed errors.
#[allow(dead_code)]
pub mod codes {
    pub const UNAUTHORIZED: &str = "UNAUTHORIZED";
    pub const INVALID_PSK: &str = "INVALID_PSK";
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const VALIDATION_ERROR: &str = "VALIDATION_ERROR";
    pub const CONFLICT: &str = "CONFLICT";
    pub const VERSION_MISMATCH: &str = "VERSION_MISMATCH";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
    pub const DATABASE_ERROR: &str = "DATABASE_ERROR";
    pub const SEARCH_ERROR: &str = "SEARCH_ERROR";
    pub const BAD_REQUEST: &str = "BAD_REQUEST";
}

/// Application error type.
#[derive(Debug)]
pub enum AppError {
    /// Authentication required
    Unauthorized(String),
    /// Resource not found
    NotFound(String),
    /// Validation error
    Validation(String),
    /// Optimistic concurrency conflict
    Conflict {
        message: String,
        current_version: i64,
    },
    /// Database error
    Database(String),
    /// Search index error
    Search(String),
    /// Internal server error
    Internal(String),
    /// Bad request
    BadRequest(String),
}

impl AppError {
    /// Get the HTTP status code for this error.
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::Conflict { .. } => StatusCode::CONFLICT,
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Search(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
        }
    }

    /// Get the error code for this error.
    pub fn error_code(&self) -> &'static str {
        match self {
            AppError::Unauthorized(_) => codes::UNAUTHORIZED,
            AppError::NotFound(_) => codes::NOT_FOUND,
            AppError::Validation(_) => codes::VALIDATION_ERROR,
            AppError::Conflict { .. } => codes::VERSION_MISMATCH,
            AppError::Database(_) => codes::DATABASE_ERROR,
            AppError::Search(_) => codes::SEARCH_ERROR,
            AppError::Internal(_) => codes::INTERNAL_ERROR,
            AppError::BadRequest(_) => codes::BAD_REQUEST,
        }
    }

    /// Get the error message.
    pub fn message(&self) -> String {
        match self {
            AppError::Unauthorized(msg) => msg.clone(),
            AppError::NotFound(msg) => msg.clone(),
            AppError::Validation(msg) => msg.clone(),
            AppError::Conflict { message, .. } => message.clone(),
            AppError::Database(msg) => msg.clone(),
            AppError::Search(msg) => msg.clone(),
            AppError::Internal(msg) => msg.clone(),
            AppError::BadRequest(msg) => msg.clone(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.error_code(), self.message())
    }
}

impl std::error::Error for AppError {}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!("Database error: {:?}", err);
        AppError::Database(format!("Database error: {}", err))
    }
}

impl From<tantivy::TantivyError> for AppError {
    fn from(err: tantivy::TantivyError) -> Self {
        tracing::error!("Search error: {:?}", err);
        AppError::Search(format!("Search error: {}", err))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        tracing::error!("JSON error: {:?}", err);
        AppError::BadRequest(format!("JSON error: {}", err))
    }
}

/// Error details in the response envelope.
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorDetails {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Error response envelope.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub success: bool,
    pub error: ErrorDetails,
    pub revision_id: i64,
}

impl ErrorResponse {
    pub fn new(error: &AppError, revision_id: i64) -> Self {
        let details = match error {
            AppError::Conflict {
                current_version, ..
            } => Some(serde_json::json!({ "currentVersion": current_version })),
            _ => None,
        };

        Self {
            success: false,
            error: ErrorDetails {
                code: error.error_code().to_string(),
                message: error.message(),
                details,
            },
            revision_id,
        }
    }
}

/// Wrapper type for errors that carry revision_id context.
pub struct AppErrorWithRevision {
    pub error: AppError,
    pub revision_id: i64,
}

impl IntoResponse for AppErrorWithRevision {
    fn into_response(self) -> Response {
        let status = self.error.status_code();
        let body = ErrorResponse::new(&self.error, self.revision_id);
        (status, Json(body)).into_response()
    }
}
