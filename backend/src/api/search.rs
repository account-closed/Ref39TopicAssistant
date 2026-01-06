//! Search API endpoints.

use axum::extract::{Query, State};
use serde::{Deserialize, Serialize};

use super::{error, success, ApiResult};
use crate::models::Topic;
use crate::AppState;

/// Search query parameters.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    /// Search query string.
    pub q: String,
    /// Maximum number of results (default: 20).
    #[serde(default = "default_limit")]
    pub limit: usize,
    /// Offset for pagination (default: 0).
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    20
}

/// Search result with topics and metadata.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResultItem>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
}

/// Single search result item.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultItem {
    pub topic: Topic,
    pub score: f32,
}

/// Maximum number of search results allowed.
const MAX_SEARCH_LIMIT: usize = 100;

/// GET /api/search - Search for topics.
pub async fn search_topics(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> ApiResult<SearchResponse> {
    let revision_id = state.repo.get_revision_id().await.unwrap_or(0);

    // Limit the maximum number of results
    let limit = params.limit.min(MAX_SEARCH_LIMIT);

    // Perform search
    let search_results = match state.search.search(&params.q, limit, params.offset) {
        Ok(results) => results,
        Err(e) => return error(e, revision_id),
    };

    // Fetch full topic data for each result
    let mut results = Vec::new();
    for sr in search_results {
        if let Ok(Some(topic)) = state.repo.get_topic(&sr.topic_id).await {
            results.push(SearchResultItem {
                topic,
                score: sr.score,
            });
        }
    }

    let total = results.len();

    success(
        SearchResponse {
            results,
            total,
            limit,
            offset: params.offset,
        },
        revision_id,
    )
}
