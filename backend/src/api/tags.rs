//! Tag API endpoints.

use axum::{
    extract::{Path, State},
    Json,
};

use super::{error, success, ApiResult};
use crate::errors::AppError;
use crate::models::{CreateTagRequest, Tag, UpdateTagRequest};
use crate::AppState;

/// GET /api/tags - List all tags.
pub async fn list_tags(State(state): State<AppState>) -> ApiResult<Vec<Tag>> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.list_tags().await {
        Ok(tags) => success(tags, revision_id),
        Err(e) => error(e, revision_id),
    }
}

/// POST /api/tags - Create a new tag.
pub async fn create_tag(
    State(state): State<AppState>,
    Json(request): Json<CreateTagRequest>,
) -> ApiResult<Tag> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    // Validate required fields
    if request.name.trim().is_empty() {
        return error(
            AppError::Validation("Tag name is required".to_string()),
            revision_id,
        );
    }
    if request.created_by.trim().is_empty() {
        return error(
            AppError::Validation("Created by (member ID) is required".to_string()),
            revision_id,
        );
    }

    match state.repo.create_tag(&request).await {
        Ok(tag) => {
            // Rebuild search index to include new tag keywords
            rebuild_search_index_async(&state).await;

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(tag, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// PUT /api/tags/:id - Update a tag.
pub async fn update_tag(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UpdateTagRequest>,
) -> ApiResult<Tag> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.update_tag(&id, &request).await {
        Ok(tag) => {
            // Rebuild search index to reflect tag changes in topic search
            rebuild_search_index_async(&state).await;

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(tag, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// DELETE /api/tags/:id - Delete a tag.
pub async fn delete_tag(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<()> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.delete_tag(&id).await {
        Ok(()) => {
            // Rebuild search index to remove tag from topic search
            rebuild_search_index_async(&state).await;

            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success((), new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// Rebuild search index asynchronously (non-blocking).
async fn rebuild_search_index_async(state: &AppState) {
    let topics = match state.repo.list_topics().await {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("Failed to list topics for reindex: {}", e);
            return;
        }
    };
    let tags = match state.repo.list_tags().await {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("Failed to list tags for reindex: {}", e);
            return;
        }
    };

    if let Err(e) = state.search.rebuild(&topics, &tags).await {
        tracing::warn!("Failed to rebuild search index: {}", e);
    }
}
