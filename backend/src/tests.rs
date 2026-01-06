//! Integration tests for the RACI backend.

use std::sync::Arc;

use reqwest::Client;
use serde_json::{json, Value};
use tempfile::TempDir;

use crate::config::Config;
use crate::db::{init_database, Repository};
use crate::search::SearchIndex;
use crate::{create_router, AppState};

/// Test fixture for integration tests.
struct TestFixture {
    client: Client,
    base_url: String,
    _temp_dir: TempDir,
}

impl TestFixture {
    async fn new() -> Self {
        Self::with_psk(Some("test-api-key".to_string())).await
    }

    async fn with_psk(psk: Option<String>) -> Self {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let db_path = temp_dir.path().join("test.sqlite");
        let index_path = temp_dir.path().join("index");

        // Initialize database
        let pool = init_database(&db_path).await.expect("Failed to init DB");
        let repo = Arc::new(Repository::new(pool));

        // Initialize search index
        let search = Arc::new(SearchIndex::open(&index_path).expect("Failed to init search"));

        // Create config
        let config = Config {
            api_psk: psk.clone(),
            db_path,
            index_path,
            bind_addr: "127.0.0.1:0".parse().unwrap(),
            log_level: "warn".to_string(),
        };

        let state = AppState {
            repo,
            search,
            config: Arc::new(config),
        };

        let app = create_router(state);

        // Bind to random port
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("Failed to bind");
        let addr = listener.local_addr().expect("Failed to get addr");
        let base_url = format!("http://{}", addr);

        // Spawn server
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        // Wait for server to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let mut client_builder = Client::builder();
        if let Some(key) = psk {
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("x-api-key", key.parse().unwrap());
            client_builder = client_builder.default_headers(headers);
        }

        TestFixture {
            client: client_builder.build().unwrap(),
            base_url,
            _temp_dir: temp_dir,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

#[tokio::test]
async fn test_health_check() {
    let fixture = TestFixture::new().await;

    let resp = fixture
        .client
        .get(fixture.url("/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "OK");
}

#[tokio::test]
async fn test_auth_missing_psk() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let index_path = temp_dir.path().join("index");

    let pool = init_database(&db_path).await.unwrap();
    let repo = Arc::new(Repository::new(pool));
    let search = Arc::new(SearchIndex::open(&index_path).unwrap());

    let config = Config {
        api_psk: Some("secret-key".to_string()),
        db_path,
        index_path,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        log_level: "warn".to_string(),
    };

    let state = AppState {
        repo,
        search,
        config: Arc::new(config),
    };

    let app = create_router(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Request without API key
    let client = Client::new();
    let resp = client
        .get(format!("http://{}/api/datastore", addr))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401);
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["success"], false);
    assert_eq!(body["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn test_auth_invalid_psk() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let index_path = temp_dir.path().join("index");

    let pool = init_database(&db_path).await.unwrap();
    let repo = Arc::new(Repository::new(pool));
    let search = Arc::new(SearchIndex::open(&index_path).unwrap());

    let config = Config {
        api_psk: Some("correct-key".to_string()),
        db_path,
        index_path,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        log_level: "warn".to_string(),
    };

    let state = AppState {
        repo,
        search,
        config: Arc::new(config),
    };

    let app = create_router(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Request with wrong API key
    let client = Client::new();
    let resp = client
        .get(format!("http://{}/api/datastore", addr))
        .header("x-api-key", "wrong-key")
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_auth_valid_psk() {
    let fixture = TestFixture::new().await;

    let resp = fixture
        .client
        .get(fixture.url("/api/datastore"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["success"], true);
}

#[tokio::test]
async fn test_datastore_get() {
    let fixture = TestFixture::new().await;

    let resp = fixture
        .client
        .get(fixture.url("/api/datastore"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["success"], true);
    assert!(body["data"]["schemaVersion"].is_number());
    assert!(body["data"]["revisionId"].is_number());
    assert!(body["revisionId"].is_number());
}

#[tokio::test]
async fn test_datastore_revision() {
    let fixture = TestFixture::new().await;

    let resp = fixture
        .client
        .get(fixture.url("/api/datastore/revision"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["success"], true);
    assert!(body["data"]["revisionId"].is_number());
}

#[tokio::test]
async fn test_member_crud() {
    let fixture = TestFixture::new().await;

    // Create member
    let create_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "Test User",
            "email": "test@example.com",
            "active": true
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(create_resp.status(), 200);
    let create_body: Value = create_resp.json().await.unwrap();
    assert_eq!(create_body["success"], true);
    let member_id = create_body["data"]["id"].as_str().unwrap();
    assert_eq!(create_body["data"]["displayName"], "Test User");
    let revision_after_create = create_body["revisionId"].as_i64().unwrap();

    // Get member
    let get_resp = fixture
        .client
        .get(fixture.url(&format!("/api/members/{}", member_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(get_resp.status(), 200);
    let get_body: Value = get_resp.json().await.unwrap();
    assert_eq!(get_body["data"]["displayName"], "Test User");

    // Update member
    let update_resp = fixture
        .client
        .put(fixture.url(&format!("/api/members/{}", member_id)))
        .json(&json!({
            "displayName": "Updated User",
            "expectedVersion": 1
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(update_resp.status(), 200);
    let update_body: Value = update_resp.json().await.unwrap();
    assert_eq!(update_body["data"]["displayName"], "Updated User");
    assert_eq!(update_body["data"]["version"], 2);
    let revision_after_update = update_body["revisionId"].as_i64().unwrap();
    assert!(revision_after_update > revision_after_create);

    // List members
    let list_resp = fixture
        .client
        .get(fixture.url("/api/members"))
        .send()
        .await
        .unwrap();

    assert_eq!(list_resp.status(), 200);
    let list_body: Value = list_resp.json().await.unwrap();
    assert!(list_body["data"].as_array().unwrap().len() >= 1);

    // Delete member
    let delete_resp = fixture
        .client
        .delete(fixture.url(&format!("/api/members/{}", member_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(delete_resp.status(), 200);
    let delete_body: Value = delete_resp.json().await.unwrap();
    let revision_after_delete = delete_body["revisionId"].as_i64().unwrap();
    assert!(revision_after_delete > revision_after_update);

    // Verify deleted
    let get_deleted_resp = fixture
        .client
        .get(fixture.url(&format!("/api/members/{}", member_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(get_deleted_resp.status(), 404);
}

#[tokio::test]
async fn test_topic_crud() {
    let fixture = TestFixture::new().await;

    // First create a member for RACI
    let member_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "RACI Owner",
            "active": true
        }))
        .send()
        .await
        .unwrap();
    let member_body: Value = member_resp.json().await.unwrap();
    let member_id = member_body["data"]["id"].as_str().unwrap();

    // Create topic
    let create_resp = fixture
        .client
        .post(fixture.url("/api/topics"))
        .json(&json!({
            "header": "Test Topic",
            "description": "A test topic for unit testing",
            "searchKeywords": ["test", "unit"],
            "raci": {
                "r1MemberId": member_id,
                "cMemberIds": [],
                "iMemberIds": []
            }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(create_resp.status(), 200);
    let create_body: Value = create_resp.json().await.unwrap();
    assert_eq!(create_body["success"], true);
    let topic_id = create_body["data"]["id"].as_str().unwrap();
    assert_eq!(create_body["data"]["header"], "Test Topic");

    // Get topic
    let get_resp = fixture
        .client
        .get(fixture.url(&format!("/api/topics/{}", topic_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(get_resp.status(), 200);

    // Update topic
    let update_resp = fixture
        .client
        .put(fixture.url(&format!("/api/topics/{}", topic_id)))
        .json(&json!({
            "header": "Updated Topic",
            "description": "Updated description"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(update_resp.status(), 200);
    let update_body: Value = update_resp.json().await.unwrap();
    assert_eq!(update_body["data"]["header"], "Updated Topic");

    // List topics
    let list_resp = fixture
        .client
        .get(fixture.url("/api/topics"))
        .send()
        .await
        .unwrap();

    assert_eq!(list_resp.status(), 200);

    // Delete topic
    let delete_resp = fixture
        .client
        .delete(fixture.url(&format!("/api/topics/{}", topic_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(delete_resp.status(), 200);
}

#[tokio::test]
async fn test_tag_crud() {
    let fixture = TestFixture::new().await;

    // Create a member first (for createdBy)
    let member_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "Tag Creator",
            "active": true
        }))
        .send()
        .await
        .unwrap();
    let member_body: Value = member_resp.json().await.unwrap();
    let member_id = member_body["data"]["id"].as_str().unwrap();

    // Create tag
    let create_resp = fixture
        .client
        .post(fixture.url("/api/tags"))
        .json(&json!({
            "name": "Test Tag",
            "searchKeywords": ["test", "demo"],
            "createdBy": member_id
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(create_resp.status(), 200);
    let create_body: Value = create_resp.json().await.unwrap();
    let tag_id = create_body["data"]["id"].as_str().unwrap();
    assert_eq!(create_body["data"]["name"], "Test Tag");

    // Update tag
    let update_resp = fixture
        .client
        .put(fixture.url(&format!("/api/tags/{}", tag_id)))
        .json(&json!({
            "name": "Updated Tag"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(update_resp.status(), 200);

    // List tags
    let list_resp = fixture
        .client
        .get(fixture.url("/api/tags"))
        .send()
        .await
        .unwrap();

    assert_eq!(list_resp.status(), 200);

    // Delete tag
    let delete_resp = fixture
        .client
        .delete(fixture.url(&format!("/api/tags/{}", tag_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(delete_resp.status(), 200);
}

#[tokio::test]
async fn test_optimistic_concurrency_conflict() {
    let fixture = TestFixture::new().await;

    // Create member
    let create_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "Concurrency Test",
            "active": true
        }))
        .send()
        .await
        .unwrap();
    let create_body: Value = create_resp.json().await.unwrap();
    let member_id = create_body["data"]["id"].as_str().unwrap();

    // Update with wrong version
    let conflict_resp = fixture
        .client
        .put(fixture.url(&format!("/api/members/{}", member_id)))
        .json(&json!({
            "displayName": "Should Fail",
            "expectedVersion": 999
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(conflict_resp.status(), 409);
    let conflict_body: Value = conflict_resp.json().await.unwrap();
    assert_eq!(conflict_body["success"], false);
    assert_eq!(conflict_body["error"]["code"], "VERSION_MISMATCH");
    assert!(conflict_body["error"]["details"]["currentVersion"].is_number());
}

#[tokio::test]
async fn test_batch_update_topics() {
    let fixture = TestFixture::new().await;

    // Create member for RACI
    let member_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "Batch Owner",
            "active": true
        }))
        .send()
        .await
        .unwrap();
    let member_body: Value = member_resp.json().await.unwrap();
    let member_id = member_body["data"]["id"].as_str().unwrap();

    // Create two topics
    let topic1_resp = fixture
        .client
        .post(fixture.url("/api/topics"))
        .json(&json!({
            "header": "Topic 1",
            "raci": { "r1MemberId": member_id, "cMemberIds": [], "iMemberIds": [] }
        }))
        .send()
        .await
        .unwrap();
    let topic1_body: Value = topic1_resp.json().await.unwrap();
    let topic1_id = topic1_body["data"]["id"].as_str().unwrap();

    let topic2_resp = fixture
        .client
        .post(fixture.url("/api/topics"))
        .json(&json!({
            "header": "Topic 2",
            "raci": { "r1MemberId": member_id, "cMemberIds": [], "iMemberIds": [] }
        }))
        .send()
        .await
        .unwrap();
    let topic2_body: Value = topic2_resp.json().await.unwrap();
    let topic2_id = topic2_body["data"]["id"].as_str().unwrap();

    let revision_before_batch = topic2_body["revisionId"].as_i64().unwrap();

    // Batch update
    let batch_resp = fixture
        .client
        .put(fixture.url("/api/topics/batch"))
        .json(&json!({
            "updates": [
                { "topicId": topic1_id, "changes": { "header": "Updated Topic 1" } },
                { "topicId": topic2_id, "changes": { "header": "Updated Topic 2" } }
            ]
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(batch_resp.status(), 200);
    let batch_body: Value = batch_resp.json().await.unwrap();
    assert_eq!(batch_body["success"], true);

    let revision_after_batch = batch_body["revisionId"].as_i64().unwrap();
    // Batch should increment revision only once
    assert_eq!(revision_after_batch, revision_before_batch + 1);

    // Verify updates
    let get1_resp = fixture
        .client
        .get(fixture.url(&format!("/api/topics/{}", topic1_id)))
        .send()
        .await
        .unwrap();
    let get1_body: Value = get1_resp.json().await.unwrap();
    assert_eq!(get1_body["data"]["header"], "Updated Topic 1");

    let get2_resp = fixture
        .client
        .get(fixture.url(&format!("/api/topics/{}", topic2_id)))
        .send()
        .await
        .unwrap();
    let get2_body: Value = get2_resp.json().await.unwrap();
    assert_eq!(get2_body["data"]["header"], "Updated Topic 2");
}

#[tokio::test]
async fn test_search_endpoint() {
    let fixture = TestFixture::new().await;

    // Create member
    let member_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "Search Test Owner",
            "active": true
        }))
        .send()
        .await
        .unwrap();
    let member_body: Value = member_resp.json().await.unwrap();
    let member_id = member_body["data"]["id"].as_str().unwrap();

    // Create topics with searchable content
    fixture
        .client
        .post(fixture.url("/api/topics"))
        .json(&json!({
            "header": "Password Reset Procedure",
            "description": "How to reset your password",
            "searchKeywords": ["password", "reset", "security"],
            "raci": { "r1MemberId": member_id, "cMemberIds": [], "iMemberIds": [] }
        }))
        .send()
        .await
        .unwrap();

    fixture
        .client
        .post(fixture.url("/api/topics"))
        .json(&json!({
            "header": "New Employee Onboarding",
            "description": "Onboarding process for new hires",
            "searchKeywords": ["onboarding", "employee", "hr"],
            "raci": { "r1MemberId": member_id, "cMemberIds": [], "iMemberIds": [] }
        }))
        .send()
        .await
        .unwrap();

    // Wait for search index to update
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    // Search for password
    let search_resp = fixture
        .client
        .get(fixture.url("/api/search?q=password&limit=10"))
        .send()
        .await
        .unwrap();

    assert_eq!(search_resp.status(), 200);
    let search_body: Value = search_resp.json().await.unwrap();
    assert_eq!(search_body["success"], true);

    let results = search_body["data"]["results"].as_array().unwrap();
    assert!(!results.is_empty());
    assert!(results[0]["topic"]["header"]
        .as_str()
        .unwrap()
        .contains("Password"));
    assert!(results[0]["score"].as_f64().unwrap() > 0.0);

    // Search for onboarding
    let search_resp2 = fixture
        .client
        .get(fixture.url("/api/search?q=onboarding&limit=10"))
        .send()
        .await
        .unwrap();

    let search_body2: Value = search_resp2.json().await.unwrap();
    let results2 = search_body2["data"]["results"].as_array().unwrap();
    assert!(!results2.is_empty());
    assert!(results2[0]["topic"]["header"]
        .as_str()
        .unwrap()
        .contains("Onboarding"));
}

#[tokio::test]
async fn test_validation_errors() {
    let fixture = TestFixture::new().await;

    // Create member with empty name
    let resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "",
            "active": true
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 400);
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["success"], false);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

    // Create topic without RACI
    let resp2 = fixture
        .client
        .post(fixture.url("/api/topics"))
        .json(&json!({
            "header": "Test",
            "raci": { "r1MemberId": "", "cMemberIds": [], "iMemberIds": [] }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp2.status(), 400);
}

#[tokio::test]
async fn test_revision_increments_on_writes() {
    let fixture = TestFixture::new().await;

    // Get initial revision
    let initial_resp = fixture
        .client
        .get(fixture.url("/api/datastore/revision"))
        .send()
        .await
        .unwrap();
    let initial_body: Value = initial_resp.json().await.unwrap();
    let initial_revision = initial_body["data"]["revisionId"].as_i64().unwrap();

    // Create member
    let create_resp = fixture
        .client
        .post(fixture.url("/api/members"))
        .json(&json!({
            "displayName": "Revision Test",
            "active": true
        }))
        .send()
        .await
        .unwrap();
    let create_body: Value = create_resp.json().await.unwrap();
    let after_create = create_body["revisionId"].as_i64().unwrap();
    assert_eq!(after_create, initial_revision + 1);

    let member_id = create_body["data"]["id"].as_str().unwrap();

    // Update member
    let update_resp = fixture
        .client
        .put(fixture.url(&format!("/api/members/{}", member_id)))
        .json(&json!({ "displayName": "Updated" }))
        .send()
        .await
        .unwrap();
    let update_body: Value = update_resp.json().await.unwrap();
    let after_update = update_body["revisionId"].as_i64().unwrap();
    assert_eq!(after_update, initial_revision + 2);

    // Delete member
    let delete_resp = fixture
        .client
        .delete(fixture.url(&format!("/api/members/{}", member_id)))
        .send()
        .await
        .unwrap();
    let delete_body: Value = delete_resp.json().await.unwrap();
    let after_delete = delete_body["revisionId"].as_i64().unwrap();
    assert_eq!(after_delete, initial_revision + 3);
}

#[tokio::test]
async fn test_not_found_errors() {
    let fixture = TestFixture::new().await;

    // Get non-existent member
    let resp = fixture
        .client
        .get(fixture.url("/api/members/non-existent-id"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 404);
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["success"], false);
    assert_eq!(body["error"]["code"], "NOT_FOUND");

    // Get non-existent topic
    let resp2 = fixture
        .client
        .get(fixture.url("/api/topics/non-existent-id"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp2.status(), 404);
}
