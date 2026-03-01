use axum::{
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;

use crate::db::Database;
use crate::models::ErrorResponse;

/// Extract instance ID and API key from headers.
pub fn extract_auth_headers(headers: &HeaderMap) -> Option<(String, String)> {
    let instance_id = headers
        .get("X-Instance-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())?;

    let api_key = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_string())?;

    Some((instance_id, api_key))
}

/// Verify API key against stored hash.
pub fn verify_api_key(api_key: &str, stored_hash: &str) -> bool {
    // Simple comparison for now - in production, use proper hashing (e.g., argon2)
    // For MVP, we'll use SHA-256
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    api_key.hash(&mut hasher);
    let hash = hasher.finish();
    let hash_str = format!("{:x}", hash);

    hash_str == stored_hash
}

/// Hash an API key for storage.
pub fn hash_api_key(api_key: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    api_key.hash(&mut hasher);
    let hash = hasher.finish();
    format!("{:x}", hash)
}

/// Authentication middleware for protected routes.
pub async fn auth_middleware(
    State(db): State<Arc<Database>>,
    headers: HeaderMap,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract auth headers
    let (instance_id, api_key) = match extract_auth_headers(&headers) {
        Some(auth) => auth,
        None => {
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    // Get instance from database
    let instance = match db.get_instance(&instance_id) {
        Ok(Some(inst)) => inst,
        Ok(None) => {
            return Err(StatusCode::NOT_FOUND);
        }
        Err(_) => {
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Verify API key
    if !verify_api_key(&api_key, &instance.api_key_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Add instance_id to request extensions for use in handlers
    request.extensions_mut().insert(instance_id);

    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_hashing() {
        let api_key = "test-api-key-12345";
        let hash = hash_api_key(api_key);

        assert!(verify_api_key(api_key, &hash));
        assert!(!verify_api_key("wrong-key", &hash));
    }
}
