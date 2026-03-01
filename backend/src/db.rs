use anyhow::{Context, Result};
use libmdbx::{Database as MdbxDatabase, Environment, WriteFlags};
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::models::{ChangeEvent, ChangeEventType, DbKeys, EncryptedPayload, EntityType, Instance};

/// Database wrapper around libmdbx.
/// Provides instance-isolated storage for encrypted data.
pub struct Database {
    env: Arc<Environment>,
    db: Arc<MdbxDatabase>,
}

impl Database {
    /// Create a new database instance.
    pub fn new(path: &str) -> Result<Self> {
        let path = Path::new(path);

        // Create directory if it doesn't exist
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create database directory")?;
        }

        // Open or create environment
        let env = Environment::new()
            .set_max_dbs(10)
            .open(path)
            .context("Failed to open database environment")?;

        // Open or create main database
        let txn = env.begin_rw_txn().context("Failed to begin transaction")?;
        let db = txn
            .create_db(None, libmdbx::DatabaseFlags::empty())
            .context("Failed to create database")?;
        txn.commit().context("Failed to commit transaction")?;

        Ok(Self {
            env: Arc::new(env),
            db: Arc::new(db),
        })
    }

    /// Store encrypted datastore for an instance.
    pub fn store_datastore(&self, instance_id: &str, payload: &EncryptedPayload) -> Result<()> {
        let key = DbKeys::datastore_key(instance_id);
        let value = serde_json::to_vec(payload)?;

        let txn = self.env.begin_rw_txn()?;
        txn.put(&self.db, key.as_bytes(), &value, WriteFlags::empty())?;
        txn.commit()?;

        Ok(())
    }

    /// Retrieve encrypted datastore for an instance.
    pub fn get_datastore(&self, instance_id: &str) -> Result<Option<EncryptedPayload>> {
        let key = DbKeys::datastore_key(instance_id);

        let txn = self.env.begin_ro_txn()?;
        let result = txn.get::<&[u8]>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let payload: EncryptedPayload = serde_json::from_slice(data)?;
                Ok(Some(payload))
            }
            Err(libmdbx::Error::NotFound) => Ok(None),
            Err(e) => Err(anyhow::Error::new(e)),
        }
    }

    /// Get revision ID for an instance.
    pub fn get_revision(&self, instance_id: &str) -> Result<u64> {
        let key = DbKeys::revision_key(instance_id);

        let txn = self.env.begin_ro_txn()?;
        let result = txn.get::<&[u8]>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let revision_str = String::from_utf8(Vec::from(data))?;
                let revision: u64 = revision_str.parse()?;
                Ok(revision)
            }
            Err(libmdbx::Error::NotFound) => Ok(0),
            Err(e) => Err(e.into()),
        }
    }

    /// Increment and return new revision ID.
    pub fn increment_revision(&self, instance_id: &str) -> Result<u64> {
        let key = DbKeys::revision_key(instance_id);

        let txn = self.env.begin_rw_txn()?;

        let current = match txn.get::<&[u8]>(&self.db, key.as_bytes()) {
            Ok(data) => {
                let revision_str = String::from_utf8(Vec::from(data))?;
                revision_str.parse::<u64>()?
            }
            Err(libmdbx::Error::NotFound) => 0,
            Err(e) => return Err(e.into()),
        };

        let new_revision = current + 1;
        let value = new_revision.to_string();

        txn.put(&self.db, key.as_bytes(), value.as_bytes(), WriteFlags::empty())?;
        txn.commit()?;

        Ok(new_revision)
    }

    /// Store instance metadata.
    pub fn store_instance(&self, instance: &Instance) -> Result<()> {
        let key = DbKeys::instance_key(&instance.instance_id);
        let value = serde_json::to_vec(instance)?;

        let txn = self.env.begin_rw_txn()?;
        txn.put(&self.db, key.as_bytes(), &value, WriteFlags::empty())?;
        txn.commit()?;

        Ok(())
    }

    /// Get instance metadata.
    pub fn get_instance(&self, instance_id: &str) -> Result<Option<Instance>> {
        let key = DbKeys::instance_key(instance_id);

        let txn = self.env.begin_ro_txn()?;
        let result = txn.get::<&[u8]>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let instance: Instance = serde_json::from_slice(data)?;
                Ok(Some(instance))
            }
            Err(libmdbx::Error::NotFound) => Ok(None),
            Err(e) => Err(anyhow::Error::new(e)),
        }
    }

    /// Check if instance exists.
    pub fn instance_exists(&self, instance_id: &str) -> Result<bool> {
        Ok(self.get_instance(instance_id)?.is_some())
    }

    /// Store an atomic entity (topic, tag, or member).
    pub fn store_entity(
        &self,
        instance_id: &str,
        entity_type: EntityType,
        entity_id: &str,
        payload: &EncryptedPayload,
        event_type: ChangeEventType,
        by_member_id: Option<String>,
    ) -> Result<u64> {
        let key = match entity_type {
            EntityType::Topic => DbKeys::topic_key(instance_id, entity_id),
            EntityType::Tag => DbKeys::tag_key(instance_id, entity_id),
            EntityType::Member => DbKeys::member_key(instance_id, entity_id),
        };
        let value = serde_json::to_vec(payload)?;

        let txn = self.env.begin_rw_txn()?;
        txn.put(&self.db, key.as_bytes(), &value, WriteFlags::empty())?;

        // Increment revision
        let revision_key = DbKeys::revision_key(instance_id);
        let current = match txn.get::<&[u8]>(&self.db, revision_key.as_bytes()) {
            Ok(data) => {
                let revision_str = String::from_utf8(Vec::from(data))?;
                revision_str.parse::<u64>()?
            }
            Err(libmdbx::Error::NotFound) => 0,
            Err(e) => return Err(anyhow::Error::new(e)),
        };
        let new_revision = current + 1;
        txn.put(
            &self.db,
            revision_key.as_bytes(),
            new_revision.to_string().as_bytes(),
            WriteFlags::empty(),
        )?;

        // Store change event
        let change_event = ChangeEvent {
            entity_type,
            entity_id: entity_id.to_string(),
            event_type,
            revision_id: new_revision,
            timestamp: chrono::Utc::now().to_rfc3339(),
            by_member_id,
        };
        let change_key = DbKeys::change_event_key(instance_id, new_revision);
        let change_value = serde_json::to_vec(&change_event)?;
        txn.put(
            &self.db,
            change_key.as_bytes(),
            &change_value,
            WriteFlags::empty(),
        )?;

        txn.commit()?;
        Ok(new_revision)
    }

    /// Get an atomic entity by ID.
    pub fn get_entity(
        &self,
        instance_id: &str,
        entity_type: EntityType,
        entity_id: &str,
    ) -> Result<Option<EncryptedPayload>> {
        let key = match entity_type {
            EntityType::Topic => DbKeys::topic_key(instance_id, entity_id),
            EntityType::Tag => DbKeys::tag_key(instance_id, entity_id),
            EntityType::Member => DbKeys::member_key(instance_id, entity_id),
        };

        let txn = self.env.begin_ro_txn()?;
        let result = txn.get::<&[u8]>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let payload: EncryptedPayload = serde_json::from_slice(data)?;
                Ok(Some(payload))
            }
            Err(libmdbx::Error::NotFound) => Ok(None),
            Err(e) => Err(anyhow::Error::new(e)),
        }
    }

    /// Delete an atomic entity.
    pub fn delete_entity(
        &self,
        instance_id: &str,
        entity_type: EntityType,
        entity_id: &str,
        by_member_id: Option<String>,
    ) -> Result<u64> {
        let key = match entity_type {
            EntityType::Topic => DbKeys::topic_key(instance_id, entity_id),
            EntityType::Tag => DbKeys::tag_key(instance_id, entity_id),
            EntityType::Member => DbKeys::member_key(instance_id, entity_id),
        };

        let txn = self.env.begin_rw_txn()?;

        // Delete the entity
        match txn.del(&self.db, key.as_bytes(), None) {
            Ok(_) => {},
            Err(libmdbx::Error::NotFound) => {
                // Entity doesn't exist, still increment revision and record event
            },
            Err(e) => return Err(anyhow::Error::new(e)),
        }

        // Increment revision
        let revision_key = DbKeys::revision_key(instance_id);
        let current = match txn.get::<&[u8]>(&self.db, revision_key.as_bytes()) {
            Ok(data) => {
                let revision_str = String::from_utf8(Vec::from(data))?;
                revision_str.parse::<u64>()?
            }
            Err(libmdbx::Error::NotFound) => 0,
            Err(e) => return Err(anyhow::Error::new(e)),
        };
        let new_revision = current + 1;
        txn.put(
            &self.db,
            revision_key.as_bytes(),
            new_revision.to_string().as_bytes(),
            WriteFlags::empty(),
        )?;

        // Store change event
        let change_event = ChangeEvent {
            entity_type,
            entity_id: entity_id.to_string(),
            event_type: ChangeEventType::Delete,
            revision_id: new_revision,
            timestamp: chrono::Utc::now().to_rfc3339(),
            by_member_id,
        };
        let change_key = DbKeys::change_event_key(instance_id, new_revision);
        let change_value = serde_json::to_vec(&change_event)?;
        txn.put(
            &self.db,
            change_key.as_bytes(),
            &change_value,
            WriteFlags::empty(),
        )?;

        txn.commit()?;
        Ok(new_revision)
    }

    /// Get all change events since a given revision.
    pub fn get_changes_since(&self, instance_id: &str, since_revision: u64) -> Result<Vec<ChangeEvent>> {
        let prefix = DbKeys::changes_prefix(instance_id);
        let txn = self.env.begin_ro_txn()?;
        let cursor = txn.open_cursor(&self.db)?;

        let mut changes = Vec::new();

        // Iterate through all change events for this instance
        for item in cursor.iter_from(prefix.as_bytes()) {
            let (key_bytes, value_bytes) = item?;
            let key = String::from_utf8_lossy(key_bytes);

            // Check if still in our prefix
            if !key.starts_with(&prefix) {
                break;
            }

            // Parse the change event
            let change_event: ChangeEvent = serde_json::from_slice(value_bytes)?;

            // Only include changes after the requested revision
            if change_event.revision_id > since_revision {
                changes.push(change_event);
            }
        }

        Ok(changes)
    }

    /// Get all entities of a specific type for an instance.
    pub fn list_entities(
        &self,
        instance_id: &str,
        entity_type: EntityType,
    ) -> Result<Vec<(String, EncryptedPayload)>> {
        let prefix = match entity_type {
            EntityType::Topic => DbKeys::topics_prefix(instance_id),
            EntityType::Tag => DbKeys::tags_prefix(instance_id),
            EntityType::Member => DbKeys::members_prefix(instance_id),
        };

        let txn = self.env.begin_ro_txn()?;
        let cursor = txn.open_cursor(&self.db)?;

        let mut entities = Vec::new();

        for item in cursor.iter_from(prefix.as_bytes()) {
            let (key_bytes, value_bytes) = item?;
            let key = String::from_utf8_lossy(key_bytes);

            // Check if still in our prefix
            if !key.starts_with(&prefix) {
                break;
            }

            // Extract entity ID from key
            let entity_id = key.strip_prefix(&prefix).unwrap_or("").to_string();

            // Parse the encrypted payload
            let payload: EncryptedPayload = serde_json::from_slice(value_bytes)?;
            entities.push((entity_id, payload));
        }

        Ok(entities)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_creation() {
        let temp_dir = std::env::temp_dir().join("raci-test-db");
        let _ = std::fs::remove_dir_all(&temp_dir);

        let db = Database::new(temp_dir.to_str().unwrap()).unwrap();

        let payload = EncryptedPayload {
            ciphertext: "test".to_string(),
            iv: "test".to_string(),
            tag: "test".to_string(),
            version: 1,
        };

        db.store_datastore("test-instance", &payload).unwrap();
        let retrieved = db.get_datastore("test-instance").unwrap().unwrap();

        assert_eq!(retrieved.ciphertext, "test");
        assert_eq!(retrieved.version, 1);

        std::fs::remove_dir_all(&temp_dir).ok();
    }
}
