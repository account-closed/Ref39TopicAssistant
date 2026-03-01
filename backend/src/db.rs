use anyhow::{Context, Result};
use libmdbx::{Database as MdbxDatabase, Environment, WriteFlags};
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::models::{DbKeys, EncryptedPayload, Instance};

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
        let result = txn.get::<Vec<u8>>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let payload: EncryptedPayload = serde_json::from_slice(&data)?;
                Ok(Some(payload))
            }
            Err(libmdbx::Error::NotFound) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Get revision ID for an instance.
    pub fn get_revision(&self, instance_id: &str) -> Result<u64> {
        let key = DbKeys::revision_key(instance_id);

        let txn = self.env.begin_ro_txn()?;
        let result = txn.get::<Vec<u8>>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let revision_str = String::from_utf8(data)?;
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

        let current = match txn.get::<Vec<u8>>(&self.db, key.as_bytes()) {
            Ok(data) => {
                let revision_str = String::from_utf8(data)?;
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
        let result = txn.get::<Vec<u8>>(&self.db, key.as_bytes());

        match result {
            Ok(data) => {
                let instance: Instance = serde_json::from_slice(&data)?;
                Ok(Some(instance))
            }
            Err(libmdbx::Error::NotFound) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Check if instance exists.
    pub fn instance_exists(&self, instance_id: &str) -> Result<bool> {
        Ok(self.get_instance(instance_id)?.is_some())
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
