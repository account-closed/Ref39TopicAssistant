//! RACI Topic Finder Backend
//!
//! A production-grade REST backend with SQLite persistence and Tantivy full-text search.

mod api;
mod auth;
mod config;
mod db;
mod errors;
mod models;
mod search;

use std::sync::Arc;

use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use config::Config;
use db::Repository;
use search::SearchIndex;

/// Application state shared across all handlers.
#[derive(Clone)]
pub struct AppState {
    pub repo: Arc<Repository>,
    pub search: Arc<SearchIndex>,
    pub config: Arc<Config>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = Config::from_env();

    // Initialize logging
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&config.log_level));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting RACI Topic Finder Backend");
    tracing::info!("Database path: {:?}", config.db_path);
    tracing::info!("Index path: {:?}", config.index_path);
    tracing::info!("Bind address: {}", config.bind_addr);

    // Warn if PSK is not configured
    if config.api_psk.is_none() {
        tracing::warn!("No API PSK configured (RACI_API_PSK). Authentication is disabled!");
    }

    // Initialize database
    let pool = db::init_database(&config.db_path).await?;
    let repo = Arc::new(Repository::new(pool));

    // Initialize search index
    let search = Arc::new(SearchIndex::open(&config.index_path)?);

    // Build initial search index from database
    tracing::info!("Building search index...");
    let topics = repo.list_topics().await?;
    let tags = repo.list_tags().await?;
    search.rebuild(&topics, &tags).await?;
    tracing::info!("Search index built with {} topics", topics.len());

    // Create application state
    let state = AppState {
        repo,
        search,
        config: Arc::new(config.clone()),
    };

    // Build router
    let app = create_router(state);

    // Start server
    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!("Server listening on {}", config.bind_addr);

    axum::serve(listener, app).await?;

    Ok(())
}

/// Create the application router with all routes.
pub fn create_router(state: AppState) -> Router {
    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Clone PSK for the auth layer
    let psk = state.config.api_psk.clone();

    // API routes
    let api_routes = Router::new()
        // Datastore
        .route("/datastore", get(api::get_datastore))
        .route("/datastore/revision", get(api::get_revision))
        // Topics
        .route("/topics", get(api::list_topics))
        .route("/topics", post(api::create_topic))
        .route("/topics/batch", put(api::batch_update_topics))
        .route("/topics/{id}", get(api::get_topic))
        .route("/topics/{id}", put(api::update_topic))
        .route("/topics/{id}", delete(api::delete_topic))
        // Members
        .route("/members", get(api::list_members))
        .route("/members", post(api::create_member))
        .route("/members/{id}", get(api::get_member))
        .route("/members/{id}", put(api::update_member))
        .route("/members/{id}", delete(api::delete_member))
        // Tags
        .route("/tags", get(api::list_tags))
        .route("/tags", post(api::create_tag))
        .route("/tags/{id}", put(api::update_tag))
        .route("/tags/{id}", delete(api::delete_tag))
        // Search
        .route("/search", get(api::search_topics))
        // Apply PSK auth middleware
        .layer(middleware::from_fn(move |req, next| {
            auth::psk_auth_layer(psk.clone(), req, next)
        }));

    // Health check (no auth required)
    let health_routes = Router::new().route("/health", get(health_check));

    Router::new()
        .nest("/api", api_routes)
        .merge(health_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Health check endpoint.
async fn health_check() -> &'static str {
    "OK"
}

#[cfg(test)]
mod tests;
