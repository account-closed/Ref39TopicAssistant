//! Topic API endpoints.

use axum::{
    extract::{Path, State},
    Json,
};

use super::{error, success, ApiResult};
use crate::errors::AppError;
use crate::models::{BatchUpdateTopicsRequest, CreateTopicRequest, Topic, UpdateTopicRequest};
use crate::AppState;

/// GET /api/topics - List all topics.
pub async fn list_topics(State(state): State<AppState>) -> ApiResult<Vec<Topic>> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.list_topics().await {
        Ok(topics) => success(topics, revision_id),
        Err(e) => error(e, revision_id),
    }
}

/// GET /api/topics/:id - Get a single topic.
pub async fn get_topic(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Topic> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.get_topic(&id).await {
        Ok(Some(topic)) => success(topic, revision_id),
        Ok(None) => error(
            AppError::NotFound(format!("Topic {} not found", id)),
            revision_id,
        ),
        Err(e) => error(e, revision_id),
    }
}

/// POST /api/topics - Create a new topic.
pub async fn create_topic(
    State(state): State<AppState>,
    Json(request): Json<CreateTopicRequest>,
) -> ApiResult<Topic> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    // Validate required fields
    if request.header.trim().is_empty() {
        return error(
            AppError::Validation("Header is required".to_string()),
            revision_id,
        );
    }
    if request.raci.r1_member_id.trim().is_empty() {
        return error(
            AppError::Validation("Primary responsible (r1MemberId) is required".to_string()),
            revision_id,
        );
    }

    match state.repo.create_topic(&request).await {
        Ok(topic) => {
            // Index the new topic
            let tags = state.repo.list_tags().await.unwrap_or_default();
            if let Err(e) = state.search.index_topic(&topic, &tags).await {
                tracing::warn!("Failed to index topic: {}", e);
            }

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(topic, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// PUT /api/topics/:id - Update a topic.
pub async fn update_topic(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UpdateTopicRequest>,
) -> ApiResult<Topic> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.update_topic(&id, &request).await {
        Ok(topic) => {
            // Re-index the updated topic
            let tags = state.repo.list_tags().await.unwrap_or_default();
            if let Err(e) = state.search.index_topic(&topic, &tags).await {
                tracing::warn!("Failed to re-index topic: {}", e);
            }

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(topic, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// DELETE /api/topics/:id - Delete a topic.
pub async fn delete_topic(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<()> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.delete_topic(&id).await {
        Ok(()) => {
            // Remove from search index
            if let Err(e) = state.search.remove_topic(&id).await {
                tracing::warn!("Failed to remove topic from index: {}", e);
            }

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success((), new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// PUT /api/topics/batch - Batch update multiple topics.
pub async fn batch_update_topics(
    State(state): State<AppState>,
    Json(request): Json<BatchUpdateTopicsRequest>,
) -> ApiResult<Vec<Topic>> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    if request.updates.is_empty() {
        return error(
            AppError::Validation("No updates provided".to_string()),
            revision_id,
        );
    }

    let updates: Vec<(String, UpdateTopicRequest)> = request
        .updates
        .into_iter()
        .map(|u| (u.topic_id, u.changes))
        .collect();

    match state.repo.batch_update_topics(&updates).await {
        Ok(topics) => {
            // Re-index all updated topics
            let tags = state.repo.list_tags().await.unwrap_or_default();
            for topic in &topics {
                if let Err(e) = state.search.index_topic(topic, &tags).await {
                    tracing::warn!("Failed to re-index topic {}: {}", topic.id, e);
                }
            }

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(topics, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}
