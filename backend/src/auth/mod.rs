//! PSK-based authentication module.
//!
//! Implements constant-time comparison to mitigate timing attacks.

use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use subtle::ConstantTimeEq;

use crate::errors::{codes, ErrorDetails, ErrorResponse};

/// Header name for the API key.
pub const API_KEY_HEADER: &str = "x-api-key";

/// PSK authentication layer function that takes the expected PSK as a parameter.
pub async fn psk_auth_layer(
    expected_psk: Option<String>,
    request: Request,
    next: Next,
) -> Response {
    // If no PSK is configured, allow all requests (dev mode)
    let Some(expected) = expected_psk else {
        return next.run(request).await;
    };

    // Get the API key from the request header
    let provided = request
        .headers()
        .get(API_KEY_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    match provided {
        Some(provided_key) => {
            // Constant-time comparison to prevent timing attacks
            if constant_time_compare(&provided_key, &expected) {
                next.run(request).await
            } else {
                unauthorized_response("Invalid API key")
            }
        }
        None => {
            // Also check Authorization header as bearer token
            let bearer = request
                .headers()
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
                .map(|s| s.to_string());

            match bearer {
                Some(bearer_key) if constant_time_compare(&bearer_key, &expected) => {
                    next.run(request).await
                }
                _ => unauthorized_response("Missing or invalid API key"),
            }
        }
    }
}

/// Perform constant-time string comparison.
fn constant_time_compare(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();

    // Constant-time comparison
    a_bytes.ct_eq(b_bytes).into()
}

/// Create an unauthorized response.
fn unauthorized_response(message: &str) -> Response {
    let body = ErrorResponse {
        success: false,
        error: ErrorDetails {
            code: codes::UNAUTHORIZED.to_string(),
            message: message.to_string(),
            details: None,
        },
        revision_id: 0,
    };

    (StatusCode::UNAUTHORIZED, Json(body)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constant_time_compare_equal() {
        assert!(constant_time_compare("test-key-123", "test-key-123"));
    }

    #[test]
    fn test_constant_time_compare_not_equal() {
        assert!(!constant_time_compare("test-key-123", "test-key-124"));
    }

    #[test]
    fn test_constant_time_compare_different_lengths() {
        assert!(!constant_time_compare("short", "much-longer-key"));
    }

    #[test]
    fn test_constant_time_compare_empty() {
        assert!(constant_time_compare("", ""));
        assert!(!constant_time_compare("", "not-empty"));
    }
}
