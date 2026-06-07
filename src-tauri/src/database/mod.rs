mod schema;

use std::collections::HashMap;
use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Queued     => "queued",
            Self::Downloading => "downloading",
            Self::Paused     => "paused",
            Self::Completed  => "completed",
            Self::Failed     => "failed",
            Self::Cancelled  => "cancelled",
        };
        f.write_str(s)
    }
}

impl TryFrom<String> for DownloadStatus {
    type Error = AppError;

    fn try_from(s: String) -> Result<Self> {
        match s.as_str() {
            "queued"      => Ok(Self::Queued),
            "downloading" => Ok(Self::Downloading),
            "paused"      => Ok(Self::Paused),
            "completed"   => Ok(Self::Completed),
            "failed"      => Ok(Self::Failed),
            "cancelled"   => Ok(Self::Cancelled),
            other => Err(AppError::InvalidInput(format!("unknown status: {other}"))),
        }
    }
}

impl rusqlite::types::ToSql for DownloadStatus {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        Ok(rusqlite::types::ToSqlOutput::from(self.to_string()))
    }
}

impl rusqlite::types::FromSql for DownloadStatus {
    fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
        let s = String::column_result(value)?;
        DownloadStatus::try_from(s)
            .map_err(|e| rusqlite::types::FromSqlError::Other(Box::new(e)))
    }
}

// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub status: DownloadStatus,
    pub format: Option<String>,
    pub quality: Option<String>,
    pub output_path: Option<String>,
    pub file_size: Option<i64>,
    pub downloaded_bytes: i64,
    pub progress: f64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/// Open (or create) the SQLite database at `path`, apply all pending
/// migrations, and return the connection.  The caller wraps it in
/// Arc<Mutex<Connection>> before storing in AppState.
pub fn open(path: &Path) -> Result<Connection> {
    let mut conn = Connection::open(path)?;

    // WAL gives concurrent readers while a single writer proceeds.
    // NORMAL durability is safe with WAL.  5 s busy-timeout prevents
    // immediate SQLITE_BUSY errors when the writer holds a lock.
    conn.execute_batch(
        "PRAGMA journal_mode  = WAL;
         PRAGMA foreign_keys  = ON;
         PRAGMA synchronous   = NORMAL;
         PRAGMA busy_timeout  = 5000;",
    )?;

    schema::run_migrations(&mut conn)?;

    Ok(conn)
}

// ---------------------------------------------------------------------------
// downloads — CRUD
// ---------------------------------------------------------------------------

pub fn insert_download(conn: &Connection, d: &Download) -> Result<()> {
    conn.execute(
        "INSERT INTO downloads (
            id, url, title, status, format, quality, output_path,
            file_size, downloaded_bytes, progress, error_message,
            created_at, updated_at, completed_at
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        rusqlite::params![
            d.id, d.url, d.title, d.status, d.format, d.quality, d.output_path,
            d.file_size, d.downloaded_bytes, d.progress, d.error_message,
            d.created_at, d.updated_at, d.completed_at,
        ],
    )?;
    Ok(())
}

pub fn get_download(conn: &Connection, id: &str) -> Result<Option<Download>> {
    let result = conn.query_row(
        "SELECT id, url, title, status, format, quality, output_path,
                file_size, downloaded_bytes, progress, error_message,
                created_at, updated_at, completed_at
         FROM downloads WHERE id = ?1",
        rusqlite::params![id],
        row_to_download,
    );
    match result {
        Ok(d)                                        => Ok(Some(d)),
        Err(rusqlite::Error::QueryReturnedNoRows)    => Ok(None),
        Err(e)                                       => Err(AppError::Database(e)),
    }
}

/// Returns rows ordered by created_at DESC.
pub fn list_downloads(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<Download>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, title, status, format, quality, output_path,
                file_size, downloaded_bytes, progress, error_message,
                created_at, updated_at, completed_at
         FROM downloads
         ORDER BY created_at DESC
         LIMIT ?1 OFFSET ?2",
    )?;
    let iter = stmt.query_map(rusqlite::params![limit, offset], row_to_download)?;
    let mut out = Vec::new();
    for row in iter { out.push(row?); }
    Ok(out)
}

pub fn update_download_status(conn: &Connection, id: &str, status: DownloadStatus) -> Result<()> {
    conn.execute(
        "UPDATE downloads SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![status, id],
    )?;
    Ok(())
}

pub fn update_download_progress(
    conn: &Connection,
    id: &str,
    downloaded_bytes: i64,
    progress: f64,
) -> Result<()> {
    conn.execute(
        "UPDATE downloads
         SET downloaded_bytes = ?1, progress = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        rusqlite::params![downloaded_bytes, progress, id],
    )?;
    Ok(())
}

pub fn set_download_error(conn: &Connection, id: &str, message: &str) -> Result<()> {
    conn.execute(
        "UPDATE downloads SET error_message = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![message, id],
    )?;
    Ok(())
}

pub fn clear_download_error(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE downloads SET error_message = NULL, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

/// Marks a download completed, records output_path and sets completed_at.
pub fn complete_download(conn: &Connection, id: &str, output_path: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE downloads
         SET status = 'completed', output_path = ?1, progress = 1.0,
             updated_at = datetime('now'), completed_at = datetime('now')
         WHERE id = ?2",
        rusqlite::params![output_path, id],
    )?;
    Ok(())
}

pub fn delete_download(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM downloads WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

/// Deletes all rows with status = 'completed' or 'cancelled'. Returns deleted count.
pub fn clear_history(conn: &Connection) -> Result<usize> {
    let n = conn.execute(
        "DELETE FROM downloads WHERE status IN ('completed','cancelled')",
        [],
    )?;
    Ok(n)
}

// ---------------------------------------------------------------------------
// queue_order — CRUD
// ---------------------------------------------------------------------------

/// Appends download_id at the tail of the queue (position = MAX + 1).
pub fn queue_push(conn: &Connection, download_id: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO queue_order (download_id, position)
         VALUES (?1, COALESCE((SELECT MAX(position) FROM queue_order), 0) + 1)",
        rusqlite::params![download_id],
    )?;
    Ok(())
}

/// Returns the download_id at the lowest position, without removing it.
pub fn queue_peek_next(conn: &Connection) -> Result<Option<String>> {
    let result = conn.query_row(
        "SELECT download_id FROM queue_order ORDER BY position ASC LIMIT 1",
        [],
        |row| row.get(0),
    );
    match result {
        Ok(id)                                       => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows)    => Ok(None),
        Err(e)                                       => Err(AppError::Database(e)),
    }
}

pub fn queue_remove(conn: &Connection, download_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM queue_order WHERE download_id = ?1",
        rusqlite::params![download_id],
    )?;
    Ok(())
}

/// Moves download_id to new_position; does not compact gaps.
pub fn queue_reorder(conn: &Connection, download_id: &str, new_position: i64) -> Result<()> {
    conn.execute(
        "UPDATE queue_order SET position = ?1 WHERE download_id = ?2",
        rusqlite::params![new_position, download_id],
    )?;
    Ok(())
}

/// Returns download_ids ordered by position ASC.
pub fn queue_list(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT download_id FROM queue_order ORDER BY position ASC",
    )?;
    let iter = stmt.query_map([], |row| row.get(0))?;
    let mut out = Vec::new();
    for row in iter { out.push(row?); }
    Ok(out)
}

/// Returns (download_id, position) pairs ordered by position ASC.
pub fn queue_list_with_positions(conn: &Connection) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT download_id, position FROM queue_order ORDER BY position ASC",
    )?;
    let iter = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
    let mut out = Vec::new();
    for row in iter { out.push(row?); }
    Ok(out)
}

/// Swaps the queue positions of two items.
pub fn queue_swap_positions(conn: &Connection, id1: &str, id2: &str) -> Result<()> {
    let pos1: i64 = conn.query_row(
        "SELECT position FROM queue_order WHERE download_id = ?1",
        rusqlite::params![id1],
        |row| row.get(0),
    )?;
    let pos2: i64 = conn.query_row(
        "SELECT position FROM queue_order WHERE download_id = ?1",
        rusqlite::params![id2],
        |row| row.get(0),
    )?;
    conn.execute(
        "UPDATE queue_order SET position = ?1 WHERE download_id = ?2",
        rusqlite::params![pos2, id1],
    )?;
    conn.execute(
        "UPDATE queue_order SET position = ?1 WHERE download_id = ?2",
        rusqlite::params![pos1, id2],
    )?;
    Ok(())
}

/// Marks all rows with status='downloading' as 'paused'.
/// Called on startup to recover from a crash or forced shutdown.
/// Using 'paused' (not 'failed') lets the startup banner detect them and
/// Resume All re-queues them with --continue so partial progress is kept.
pub fn reset_interrupted_downloads(conn: &Connection) -> Result<usize> {
    let n = conn.execute(
        "UPDATE downloads SET status = 'paused', error_message = 'Interrupted (app restarted)',
         updated_at = datetime('now') WHERE status = 'downloading'",
        [],
    )?;
    Ok(n)
}

pub fn queue_clear(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM queue_order", [])?;
    Ok(())
}

pub fn queue_length(conn: &Connection) -> Result<usize> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM queue_order", [], |row| row.get(0),
    )?;
    Ok(n as usize)
}

// ---------------------------------------------------------------------------
// settings — CRUD
// ---------------------------------------------------------------------------

pub fn settings_get(conn: &Connection, key: &str) -> Result<Option<String>> {
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    );
    match result {
        Ok(v)                                        => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows)    => Ok(None),
        Err(e)                                       => Err(AppError::Database(e)),
    }
}

pub fn settings_set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

/// Returns all key-value pairs as a HashMap.
pub fn settings_get_all(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let iter = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = HashMap::new();
    for row in iter {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn settings_delete(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", rusqlite::params![key])?;
    Ok(())
}

// ---------------------------------------------------------------------------
// playlist_jobs / channel_jobs / batch_imports — insert-only audit records
// ---------------------------------------------------------------------------

pub fn insert_playlist_job(
    conn: &Connection,
    id: &str,
    url: &str,
    title: Option<&str>,
    thumbnail: Option<&str>,
    entry_count: usize,
    queued_count: usize,
) -> Result<()> {
    conn.execute(
        "INSERT INTO playlist_jobs (id, url, title, thumbnail, entry_count, queued_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        rusqlite::params![id, url, title, thumbnail, entry_count as i64, queued_count as i64],
    )?;
    Ok(())
}

pub fn insert_channel_job(
    conn: &Connection,
    id: &str,
    url: &str,
    channel_name: Option<&str>,
    thumbnail: Option<&str>,
    limit_mode: Option<&str>,
    entry_count: usize,
    queued_count: usize,
) -> Result<()> {
    conn.execute(
        "INSERT INTO channel_jobs (id, url, channel_name, thumbnail, limit_mode, entry_count, queued_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
        rusqlite::params![id, url, channel_name, thumbnail, limit_mode, entry_count as i64, queued_count as i64],
    )?;
    Ok(())
}

pub fn insert_batch_import(
    conn: &Connection,
    id: &str,
    total_count: usize,
    valid_count: usize,
    invalid_count: usize,
    duplicate_count: usize,
) -> Result<()> {
    conn.execute(
        "INSERT INTO batch_imports (id, total_count, valid_count, invalid_count, duplicate_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        rusqlite::params![
            id,
            total_count as i64,
            valid_count as i64,
            invalid_count as i64,
            duplicate_count as i64,
        ],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn row_to_download(row: &rusqlite::Row<'_>) -> rusqlite::Result<Download> {
    Ok(Download {
        id:               row.get(0)?,
        url:              row.get(1)?,
        title:            row.get(2)?,
        status:           row.get(3)?,
        format:           row.get(4)?,
        quality:          row.get(5)?,
        output_path:      row.get(6)?,
        file_size:        row.get(7)?,
        downloaded_bytes: row.get(8)?,
        progress:         row.get(9)?,
        error_message:    row.get(10)?,
        created_at:       row.get(11)?,
        updated_at:       row.get(12)?,
        completed_at:     row.get(13)?,
    })
}
