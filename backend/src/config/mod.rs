//! Configuration module for the RACI backend.
//!
//! All configuration is loaded from environment variables with sensible defaults.

use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;

/// Application configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    /// Pre-shared key for API authentication (required in production)
    pub api_psk: Option<String>,
    /// Path to SQLite database file
    pub db_path: PathBuf,
    /// Path to Tantivy search index directory
    pub index_path: PathBuf,
    /// Address to bind the server to
    pub bind_addr: SocketAddr,
    /// Log level (trace, debug, info, warn, error)
    pub log_level: String,
}

impl Config {
    /// Load configuration from environment variables.
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let api_psk = env::var("RACI_API_PSK").ok();

        let db_path = env::var("RACI_DB_PATH")
            .unwrap_or_else(|_| "./data/app.sqlite".to_string())
            .into();

        let index_path = env::var("RACI_INDEX_PATH")
            .unwrap_or_else(|_| "./data/index".to_string())
            .into();

        let bind_addr = env::var("RACI_BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:8080".to_string())
            .parse()
            .expect("Invalid RACI_BIND_ADDR format");

        let log_level = env::var("RACI_LOG_LEVEL").unwrap_or_else(|_| "info".to_string());

        Self {
            api_psk,
            db_path,
            index_path,
            bind_addr,
            log_level,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        // Clear any existing env vars
        env::remove_var("RACI_API_PSK");
        env::remove_var("RACI_DB_PATH");
        env::remove_var("RACI_INDEX_PATH");
        env::remove_var("RACI_BIND_ADDR");
        env::remove_var("RACI_LOG_LEVEL");

        let config = Config::from_env();

        assert!(config.api_psk.is_none());
        assert_eq!(config.db_path, PathBuf::from("./data/app.sqlite"));
        assert_eq!(config.index_path, PathBuf::from("./data/index"));
        assert_eq!(config.bind_addr.to_string(), "127.0.0.1:8080");
        assert_eq!(config.log_level, "info");
    }
}
