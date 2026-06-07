use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::database::{self, DownloadStatus};
use crate::downloader;
use crate::error::{AppError, Result};
use crate::media;
use crate::settings::Settings;
use crate::state::DownloadHandle;

/// Spawned once at startup.  Blocks on `notify` then drains the queue until
/// all available concurrency slots are filled or the queue is empty.
pub async fn run(
    app: AppHandle,
    db: Arc<Mutex<rusqlite::Connection>>,
    active_downloads: Arc<Mutex<HashMap<String, DownloadHandle>>>,
    settings: Arc<RwLock<Settings>>,
    notify: Arc<Notify>,
) {
    tracing::info!("QUEUE: worker started");
    loop {
        notify.notified().await;
        tracing::info!("QUEUE: worker woke — checking queue");
        drain(&app, &db, &active_downloads, &settings, &notify).await;
    }
}

/// Starts as many pending downloads as the concurrency limit allows.
async fn drain(
    app: &AppHandle,
    db: &Arc<Mutex<rusqlite::Connection>>,
    active_downloads: &Arc<Mutex<HashMap<String, DownloadHandle>>>,
    settings: &Arc<RwLock<Settings>>,
    notify: &Arc<Notify>,
) {
    loop {
        // How many slots are available?
        let (active_count, max_concurrent) = {
            let ac = active_downloads.lock().map(|g| g.len()).unwrap_or(0);
            let mc = settings
                .read()
                .map(|s| s.max_concurrent_downloads)
                .unwrap_or(2);
            (ac, mc as usize)
        };

        tracing::info!("QUEUE: drain — {active_count}/{max_concurrent} slots used");

        if active_count >= max_concurrent {
            tracing::info!(
                "QUEUE: {}/{} slots full — waiting for a slot to free",
                active_count, max_concurrent
            );
            return;
        }

        // Pop next item from queue_order.
        let next = match pop_next(db).await {
            Ok(Some(item)) => item,
            Ok(None) => {
                tracing::info!("QUEUE: queue empty — going to sleep");
                return;
            }
            Err(e) => {
                tracing::warn!("QUEUE: db error in pop_next: {e}");
                return;
            }
        };

        let (download_id, url, title, format, quality, downloaded_bytes) = next;
        let resume = downloaded_bytes > 0;
        tracing::info!("QUEUE: worker picked item — {download_id} (resume={resume})");

        // Resolve runtime paths from settings.
        let (ytdlp_path, ffmpeg_path, output_dir, cookies_from) = match settings.read() {
            Err(e) => {
                tracing::warn!("QUEUE: settings lock poisoned: {e}");
                return;
            }
            Ok(s) => {
                let ytdlp = match s.ytdlp_path.clone() {
                    Some(p) => p,
                    None => {
                        tracing::warn!("QUEUE: yt-dlp not configured — cannot start {download_id}");
                        let msg = "yt-dlp path not configured";
                        mark_failed(db, &download_id, msg);
                        let _ = app.emit(
                            "download:failed",
                            json!({ "download_id": download_id, "error": msg }),
                        );
                        let _ = app.emit("queue:changed", ());
                        return;
                    }
                };
                (
                    ytdlp,
                    media::resolve_ffmpeg_path(s.ffmpeg_path.as_deref()),
                    s.output_directory.clone(),
                    s.cookie_source.as_ytdlp_arg().map(str::to_owned),
                )
            }
        };

        let format_selector = downloader::build_format_selector(&format, &quality);

        tracing::info!("QUEUE: starting download — {download_id}");

        match downloader::start(
            app.clone(),
            Arc::clone(db),
            Arc::clone(active_downloads),
            download_id.clone(),
            title,
            url,
            format_selector,
            output_dir,
            ytdlp_path,
            ffmpeg_path,
            cookies_from,
            resume,
            Arc::clone(notify),
        )
        .await
        {
            Ok(()) => {
                tracing::info!("QUEUE: download launched — {download_id}");
                let _ = app.emit("queue:changed", ());
            }
            Err(e) => {
                tracing::warn!("QUEUE: failed to start {download_id}: {e}");
                mark_failed(db, &download_id, &e.to_string());
                // Notify the frontend so the card transitions to "failed".
                let _ = app.emit(
                    "download:failed",
                    json!({ "download_id": &download_id, "error": e.to_string() }),
                );
                let _ = app.emit("queue:changed", ());
                // Don't return — try next item
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Atomically peeks the next queue item, removes it from queue_order, and
/// returns (download_id, url, title, format, quality, downloaded_bytes).
/// `downloaded_bytes > 0` means a partial download exists and the worker
/// should pass `resume = true` to `downloader::start`.
async fn pop_next(
    db: &Arc<Mutex<rusqlite::Connection>>,
) -> Result<Option<(String, String, Option<String>, String, String, i64)>> {
    let db2 = Arc::clone(db);
    tokio::task::spawn_blocking(move || {
        let conn = db2
            .lock()
            .map_err(|e| AppError::Other(e.to_string()))?;

        let id = match database::queue_peek_next(&conn)? {
            Some(id) => id,
            None => return Ok(None),
        };

        let download = match database::get_download(&conn, &id)? {
            Some(d) => d,
            None => {
                // Orphan queue entry — remove silently
                let _ = database::queue_remove(&conn, &id);
                return Ok(None);
            }
        };

        // Commit to starting this item — remove from queue before releasing lock.
        database::queue_remove(&conn, &id)?;

        let format = download.format.unwrap_or_else(|| "mp4".to_owned());
        let quality = download.quality.unwrap_or_else(|| "best".to_owned());

        Ok(Some((id, download.url, download.title, format, quality, download.downloaded_bytes)))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

fn mark_failed(db: &Arc<Mutex<rusqlite::Connection>>, id: &str, msg: &str) {
    let db2 = Arc::clone(db);
    let id2 = id.to_owned();
    let msg2 = msg.to_owned();
    tokio::task::spawn_blocking(move || {
        if let Ok(conn) = db2.lock() {
            let _ = database::set_download_error(&conn, &id2, &msg2);
            let _ = database::update_download_status(&conn, &id2, DownloadStatus::Failed);
        }
    });
}
