//! Database module for SQLite persistence.
//!
//! SQLite is the source of truth for all application data.

mod repository;

pub use repository::*;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;

/// Initialize the database connection pool and run migrations.
pub async fn init_database(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    // Ensure the parent directory exists
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .busy_timeout(std::time::Duration::from_secs(30));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run embedded migrations
    run_migrations(&pool).await?;

    Ok(pool)
}

/// Run database migrations.
async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Create tables if they don't exist
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            schema_version INTEGER NOT NULL DEFAULT 1,
            revision_id INTEGER NOT NULL DEFAULT 0,
            generated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO meta (id, schema_version, revision_id, generated_at)
        VALUES (1, 1, 0, datetime('now'));
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS members (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            email TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            tags TEXT,
            color TEXT,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            search_keywords TEXT,
            hinweise TEXT,
            copy_paste_text TEXT,
            color TEXT,
            is_super_tag INTEGER,
            is_gvpl_tag INTEGER,
            created_at TEXT NOT NULL,
            modified_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            header TEXT NOT NULL,
            description TEXT,
            tags TEXT,
            search_keywords TEXT,
            validity_always_valid INTEGER NOT NULL DEFAULT 1,
            validity_valid_from TEXT,
            validity_valid_to TEXT,
            notes TEXT,
            raci_r1_member_id TEXT NOT NULL,
            raci_r2_member_id TEXT,
            raci_r3_member_id TEXT,
            raci_c_member_ids TEXT,
            raci_i_member_ids TEXT,
            updated_at TEXT NOT NULL,
            priority INTEGER,
            has_file_number INTEGER,
            file_number TEXT,
            has_shared_file_path INTEGER,
            shared_file_path TEXT,
            size TEXT,
            version INTEGER NOT NULL DEFAULT 1
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Create indexes for common queries
    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_topics_header ON topics(header);
        CREATE INDEX IF NOT EXISTS idx_topics_updated_at ON topics(updated_at);
        CREATE INDEX IF NOT EXISTS idx_members_display_name ON members(display_name);
        CREATE INDEX IF NOT EXISTS idx_members_active ON members(active);
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
