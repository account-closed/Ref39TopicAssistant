//! Datastore API endpoints.

use axum::extract::State;

use super::{success, ApiResult};
use crate::models::{Datastore, RevisionInfo};
use crate::AppState;

/// GET /api/datastore - Get the full datastore.
pub async fn get_datastore(State(state): State<AppState>) -> ApiResult<Datastore> {
    let datastore =
        state
            .repo
            .get_datastore()
            .await
            .map_err(|e| crate::errors::AppErrorWithRevision {
                error: e,
                revision_id: 0,
            })?;

    success(datastore.clone(), datastore.revision_id)
}

/// GET /api/datastore/revision - Get the current revision info.
pub async fn get_revision(State(state): State<AppState>) -> ApiResult<RevisionInfo> {
    let revision_info =
        state
            .repo
            .get_revision_info()
            .await
            .map_err(|e| crate::errors::AppErrorWithRevision {
                error: e,
                revision_id: 0,
            })?;

    success(revision_info.clone(), revision_info.revision_id)
}
