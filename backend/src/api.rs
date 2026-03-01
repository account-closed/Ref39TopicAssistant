use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::auth::{extract_auth_headers, verify_api_key};
use crate::db::Database;
use crate::models::{
    ChangeEventType, ChangesResponse, EncryptedPayload, EntityType, ErrorResponse, HealthResponse,
    RevisionResponse, SuccessResponse,
};

#[derive(Debug, Deserialize)]
pub struct ChangesQuery {
    since: Option<u64>,
}

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

/// Get changes since a given revision.
pub async fn get_changes(
    State(db): State<Arc<Database>>,
    Path(instance_id): Path<String>,
    Query(params): Query<ChangesQuery>,
    headers: HeaderMap,
) -> Result<Json<ChangesResponse>, StatusCode> {
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

    let since_revision = params.since.unwrap_or(0);
    let changes = db
        .get_changes_since(&instance_id, since_revision)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let current_revision = db
        .get_revision(&instance_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ChangesResponse {
        changes,
        current_revision,
    }))
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

    // Generate a temporary ID - client should provide the real ID in the encrypted payload
    // For now, we'll use a placeholder pattern
    let topic_id = format!("topic-{}", uuid::Uuid::new_v4());

    // Store atomically with change event
    let new_revision = db
        .store_entity(
            &instance_id,
            EntityType::Topic,
            &topic_id,
            &payload,
            ChangeEventType::Create,
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Topic created, revision: {}", new_revision),
    }))
}

/// Update a topic (encrypted).
pub async fn update_topic(
    State(db): State<Arc<Database>>,
    Path(topic_id): Path<String>,
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

    let new_revision = db
        .store_entity(
            &instance_id,
            EntityType::Topic,
            &topic_id,
            &payload,
            ChangeEventType::Update,
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Topic updated, revision: {}", new_revision),
    }))
}

/// Delete a topic (encrypted).
pub async fn delete_topic(
    State(db): State<Arc<Database>>,
    Path(topic_id): Path<String>,
    headers: HeaderMap,
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

    let new_revision = db
        .delete_entity(&instance_id, EntityType::Topic, &topic_id, None)
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

    let member_id = format!("member-{}", uuid::Uuid::new_v4());

    let new_revision = db
        .store_entity(
            &instance_id,
            EntityType::Member,
            &member_id,
            &payload,
            ChangeEventType::Create,
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Member created, revision: {}", new_revision),
    }))
}

/// Update a member (encrypted).
pub async fn update_member(
    State(db): State<Arc<Database>>,
    Path(member_id): Path<String>,
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

    let new_revision = db
        .store_entity(
            &instance_id,
            EntityType::Member,
            &member_id,
            &payload,
            ChangeEventType::Update,
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Member updated, revision: {}", new_revision),
    }))
}

/// Delete a member (encrypted).
pub async fn delete_member(
    State(db): State<Arc<Database>>,
    Path(member_id): Path<String>,
    headers: HeaderMap,
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

    let new_revision = db
        .delete_entity(&instance_id, EntityType::Member, &member_id, None)
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

    let tag_id = format!("tag-{}", uuid::Uuid::new_v4());

    let new_revision = db
        .store_entity(
            &instance_id,
            EntityType::Tag,
            &tag_id,
            &payload,
            ChangeEventType::Create,
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Tag created, revision: {}", new_revision),
    }))
}

/// Update a tag (encrypted).
pub async fn update_tag(
    State(db): State<Arc<Database>>,
    Path(tag_id): Path<String>,
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

    let new_revision = db
        .store_entity(
            &instance_id,
            EntityType::Tag,
            &tag_id,
            &payload,
            ChangeEventType::Update,
            None,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Tag updated, revision: {}", new_revision),
    }))
}

/// Delete a tag (encrypted).
pub async fn delete_tag(
    State(db): State<Arc<Database>>,
    Path(tag_id): Path<String>,
    headers: HeaderMap,
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

    let new_revision = db
        .delete_entity(&instance_id, EntityType::Tag, &tag_id, None)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Tag deleted, revision: {}", new_revision),
    }))
}
