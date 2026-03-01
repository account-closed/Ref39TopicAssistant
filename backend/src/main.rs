mod api;
mod auth;
mod db;
mod models;

use axum::{
    routing::{get, post, patch, delete},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::db::Database;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "raci_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration from environment
    dotenvy::dotenv().ok();
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/mdbx".to_string());
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());

    tracing::info!("Initializing database at: {}", db_path);

    // Initialize database
    let db = Arc::new(Database::new(&db_path)?);

    tracing::info!("Database initialized successfully");

    // Build router with CORS
    let app = Router::new()
        .route("/health", get(api::health))
        .route("/instances/:instance_id/datastore", get(api::get_datastore))
        .route("/instances/:instance_id/revision", get(api::get_revision))
        .route("/topics", post(api::create_topic))
        .route("/topics/:topic_id", patch(api::update_topic))
        .route("/topics/:topic_id", delete(api::delete_topic))
        .route("/topics/batch", patch(api::batch_update_topics))
        .route("/members", post(api::create_member))
        .route("/members/:member_id", patch(api::update_member))
        .route("/members/:member_id", delete(api::delete_member))
        .route("/tags", post(api::create_tag))
        .route("/tags/:tag_id", patch(api::update_tag))
        .route("/tags/:tag_id", delete(api::delete_tag))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(db);

    let addr = format!("{}:{}", host, port);
    tracing::info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
