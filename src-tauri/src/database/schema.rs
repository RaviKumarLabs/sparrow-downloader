use rusqlite::Connection;

use crate::error::Result;

// ---------------------------------------------------------------------------
// Versioned migration table
// Each entry: (version, sql executed inside a transaction).
// All statements in one version are committed atomically; on failure the
// transaction rolls back and schema_version is NOT updated.
// ---------------------------------------------------------------------------

const MIGRATIONS: &[(u32, &str)] = &[
    (
        1,
        r#"
        CREATE TABLE IF NOT EXISTS downloads (
            id               TEXT    PRIMARY KEY NOT NULL,
            url              TEXT    NOT NULL,
            title            TEXT,
            status           TEXT    NOT NULL DEFAULT 'queued',
            format           TEXT,
            quality          TEXT,
            output_path      TEXT,
            file_size        INTEGER,
            downloaded_bytes INTEGER NOT NULL DEFAULT 0,
            progress         REAL    NOT NULL DEFAULT 0.0,
            error_message    TEXT,
            created_at       TEXT    NOT NULL,
            updated_at       TEXT    NOT NULL,
            completed_at     TEXT,
            CHECK (status IN (
                'queued','downloading','paused','completed','failed','cancelled'
            ))
        );

        CREATE TABLE IF NOT EXISTS queue_order (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            download_id TEXT    NOT NULL UNIQUE,
            position    INTEGER NOT NULL,
            FOREIGN KEY (download_id) REFERENCES downloads(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_downloads_status
            ON downloads(status);

        CREATE INDEX IF NOT EXISTS idx_downloads_created_at
            ON downloads(created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_queue_position
            ON queue_order(position ASC);
        "#,
    ),
    (
        2,
        r#"
        CREATE TABLE IF NOT EXISTS playlist_jobs (
            id           TEXT    PRIMARY KEY NOT NULL,
            url          TEXT    NOT NULL,
            title        TEXT,
            thumbnail    TEXT,
            entry_count  INTEGER NOT NULL DEFAULT 0,
            queued_count INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS channel_jobs (
            id           TEXT    PRIMARY KEY NOT NULL,
            url          TEXT    NOT NULL,
            channel_name TEXT,
            thumbnail    TEXT,
            limit_mode   TEXT,
            entry_count  INTEGER NOT NULL DEFAULT 0,
            queued_count INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS batch_imports (
            id              TEXT    PRIMARY KEY NOT NULL,
            total_count     INTEGER NOT NULL DEFAULT 0,
            valid_count     INTEGER NOT NULL DEFAULT 0,
            invalid_count   INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT    NOT NULL
        );
        "#,
    ),
];

// ---------------------------------------------------------------------------
// Public entry point called once during database::open()
// ---------------------------------------------------------------------------

pub(crate) fn run_migrations(conn: &mut Connection) -> Result<()> {
    // Bootstrap: schema_version must exist before we can query it.
    // This statement is idempotent and runs outside the versioned loop.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
             version    INTEGER NOT NULL,
             applied_at TEXT    NOT NULL
         );",
    )?;

    let current: u32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?;

    for &(version, sql) in MIGRATIONS {
        if version <= current {
            continue;
        }

        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_version (version, applied_at) \
             VALUES (?1, datetime('now'))",
            rusqlite::params![version],
        )?;
        tx.commit()?;
    }

    Ok(())
}
