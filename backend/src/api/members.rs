//! Member API endpoints.

use axum::{
    extract::{Path, State},
    Json,
};

use super::{error, success, ApiResult};
use crate::errors::AppError;
use crate::models::{CreateMemberRequest, TeamMember, UpdateMemberRequest};
use crate::AppState;

/// GET /api/members - List all members.
pub async fn list_members(State(state): State<AppState>) -> ApiResult<Vec<TeamMember>> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.list_members().await {
        Ok(members) => success(members, revision_id),
        Err(e) => error(e, revision_id),
    }
}

/// GET /api/members/:id - Get a single member.
pub async fn get_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<TeamMember> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.get_member(&id).await {
        Ok(Some(member)) => success(member, revision_id),
        Ok(None) => error(
            AppError::NotFound(format!("Member {} not found", id)),
            revision_id,
        ),
        Err(e) => error(e, revision_id),
    }
}

/// POST /api/members - Create a new member.
pub async fn create_member(
    State(state): State<AppState>,
    Json(request): Json<CreateMemberRequest>,
) -> ApiResult<TeamMember> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    // Validate required fields
    if request.display_name.trim().is_empty() {
        return error(
            AppError::Validation("Display name is required".to_string()),
            revision_id,
        );
    }

    match state.repo.create_member(&request).await {
        Ok(member) => {
            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(member, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// PUT /api/members/:id - Update a member.
pub async fn update_member(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UpdateMemberRequest>,
) -> ApiResult<TeamMember> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.update_member(&id, &request).await {
        Ok(member) => {
            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success(member, new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}

/// DELETE /api/members/:id - Delete a member.
pub async fn delete_member(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<()> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    match state.repo.delete_member(&id).await {
        Ok(()) => {
            let new_revision = state.repo.get_revision_id().await.unwrap_or(revision_id);
            success((), new_revision)
        }
        Err(e) => error(e, revision_id),
    }
}
