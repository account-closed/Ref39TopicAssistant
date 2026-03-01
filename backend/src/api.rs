use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use std::sync::Arc;

use crate::auth::{extract_auth_headers, verify_api_key};
use crate::db::Database;
use crate::models::{EncryptedPayload, ErrorResponse, HealthResponse, RevisionResponse, SuccessResponse};

/// Health check endpoint.
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// Get encrypted datastore for an instance.
pub async fn get_datastore(
    State(db): State<Arc<Database>>,
    Path(instance_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<EncryptedPayload>, StatusCode> {
    // Verify authentication
    let (auth_instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if auth_instance_id != instance_id {
        return Err(StatusCode::FORBIDDEN);
    }

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Get encrypted datastore
    let datastore = db
        .get_datastore(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(datastore))
}

/// Get current revision ID for an instance.
pub async fn get_revision(
    State(db): State<Arc<Database>>,
    Path(instance_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<RevisionResponse>, StatusCode> {
    // Verify authentication
    let (auth_instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if auth_instance_id != instance_id {
        return Err(StatusCode::FORBIDDEN);
    }

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let revision_id = db
        .get_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(RevisionResponse { revision_id }))
}

/// Create a new topic (encrypted).
pub async fn create_topic(
    State(db): State<Arc<Database>>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Store encrypted payload
    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Increment revision
    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Topic created, revision: {}", new_revision),
    }))
}

/// Update a topic (encrypted).
pub async fn update_topic(
    State(db): State<Arc<Database>>,
    Path(_topic_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Topic updated, revision: {}", new_revision),
    }))
}

/// Delete a topic (encrypted).
pub async fn delete_topic(
    State(db): State<Arc<Database>>,
    Path(_topic_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Topic deleted, revision: {}", new_revision),
    }))
}

/// Batch update topics (encrypted).
pub async fn batch_update_topics(
    State(db): State<Arc<Database>>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Topics updated, revision: {}", new_revision),
    }))
}

/// Create a member (encrypted).
pub async fn create_member(
    State(db): State<Arc<Database>>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Member created, revision: {}", new_revision),
    }))
}

/// Update a member (encrypted).
pub async fn update_member(
    State(db): State<Arc<Database>>,
    Path(_member_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Member updated, revision: {}", new_revision),
    }))
}

/// Delete a member (encrypted).
pub async fn delete_member(
    State(db): State<Arc<Database>>,
    Path(_member_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Member deleted, revision: {}", new_revision),
    }))
}

/// Create a tag (encrypted).
pub async fn create_tag(
    State(db): State<Arc<Database>>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Tag created, revision: {}", new_revision),
    }))
}

/// Update a tag (encrypted).
pub async fn update_tag(
    State(db): State<Arc<Database>>,
    Path(_tag_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Tag updated, revision: {}", new_revision),
    }))
}

/// Delete a tag (encrypted).
pub async fn delete_tag(
    State(db): State<Arc<Database>>,
    Path(_tag_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedPayload>,
) -> Result<Json<SuccessResponse>, StatusCode> {
    let (instance_id, api_key) = extract_auth_headers(&headers)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let instance = db
        .get_instance(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    db.store_datastore(&instance_id, &payload)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_revision = db
        .increment_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Tag deleted, revision: {}", new_revision),
    }))
}
