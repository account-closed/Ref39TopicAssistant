//! REST API module.
//!
//! Contains all API routes and handlers following the frontend contract.

mod datastore;
mod members;
mod search;
mod tags;
mod topics;

pub use datastore::*;
pub use members::*;
pub use search::*;
pub use tags::*;
pub use topics::*;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

/// Success response envelope.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: T,
    pub revision_id: i64,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn new(data: T, revision_id: i64) -> Self {
        Self {
            success: true,
            data,
            revision_id,
        }
    }
}

impl<T: Serialize> IntoResponse for ApiResponse<T> {
    fn into_response(self) -> Response {
        (StatusCode::OK, Json(self)).into_response()
    }
}

/// Response type that can be either success or error.
pub type ApiResult<T> = Result<ApiResponse<T>, crate::errors::AppErrorWithRevision>;

/// Create a successful API response.
pub fn success<T: Serialize>(data: T, revision_id: i64) -> ApiResult<T> {
    Ok(ApiResponse::new(data, revision_id))
}

/// Create an error API response.
pub fn error<T: Serialize>(err: crate::errors::AppError, revision_id: i64) -> ApiResult<T> {
    Err(crate::errors::AppErrorWithRevision {
        error: err,
        revision_id,
    })
}
