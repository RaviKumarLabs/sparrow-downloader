use std::collections::HashSet;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::database::{self, Download, DownloadStatus};
use crate::downloader;
use crate::error::{AppError, Result};
use crate::extractor::{self, VideoMetadata};
use crate::settings::{self, Settings};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))
        .map(|g| g.clone())
}

#[tauri::command]
pub async fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<()> {
    if settings.max_concurrent_downloads < 1 || settings.max_concurrent_downloads > 8 {
        return Err(AppError::InvalidInput(
            "max_concurrent_downloads must be between 1 and 8".to_owned(),
        ));
    }
    if settings.default_format.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "default_format must not be empty".to_owned(),
        ));
    }
    if settings.default_quality.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "default_quality must not be empty".to_owned(),
        ));
    }

    let db = Arc::clone(&state.db);
    let settings_for_db = settings.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        settings_for_db.save_to_db(&conn)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    *state
        .settings
        .write()
        .map_err(|e| AppError::Other(e.to_string()))? = settings;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tool-path helpers
// ---------------------------------------------------------------------------

/// Returns the configured yt-dlp path.  If none is stored, tries to
/// auto-detect it (useful when the app was launched without yt-dlp on PATH
/// but the user installed it afterwards).  Persists the found path so the
/// next call is instant.
async fn resolve_ytdlp(state: &AppState) -> Result<std::path::PathBuf> {
    if let Some(p) = state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))?
        .ytdlp_path
        .clone()
    {
        return Ok(p);
    }

    let found = tokio::task::spawn_blocking(settings::detect_ytdlp_path)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    match found {
        Some(p) => {
            let db  = Arc::clone(&state.db);
            let p2  = p.clone();
            tokio::task::spawn_blocking(move || {
                if let Ok(conn) = db.lock() {
                    let _ = database::settings_set(&conn, "ytdlp_path", &p2.to_string_lossy());
                }
            }).await.ok();
            if let Ok(mut s) = state.settings.write() {
                s.ytdlp_path = Some(p.clone());
            }
            Ok(p)
        }
        None => Err(AppError::InvalidInput(
            "yt-dlp not found. Install yt-dlp or set the path in Settings.".to_owned(),
        )),
    }
}

// ---------------------------------------------------------------------------
// Settings — tool path configuration
// ---------------------------------------------------------------------------

/// Validates that `path` points to an existing file, then persists it as the
/// yt-dlp executable path in both the DB and the in-memory settings.
#[tauri::command]
pub async fn set_ytdlp_path(state: State<'_, AppState>, path: String) -> Result<()> {
    let path = path.trim().to_owned();
    if path.is_empty() {
        return Err(AppError::InvalidInput("path must not be empty".to_owned()));
    }
    let pb = std::path::PathBuf::from(&path);
    if !pb.is_file() {
        return Err(AppError::InvalidInput(format!(
            "file not found: {path}"
        )));
    }

    let db   = Arc::clone(&state.db);
    let path2 = path.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::settings_set(&conn, "ytdlp_path", &path2)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    state
        .settings
        .write()
        .map_err(|e| AppError::Other(e.to_string()))?
        .ytdlp_path = Some(pb);

    Ok(())
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_metadata(state: State<'_, AppState>, url: String) -> Result<VideoMetadata> {
    let url = url.trim().to_owned();
    if url.is_empty() {
        return Err(AppError::InvalidInput("url must not be empty".to_owned()));
    }

    let ytdlp_path = resolve_ytdlp(&state).await?;
    let cookies_from = state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))?
        .cookie_source
        .as_ytdlp_arg()
        .map(str::to_owned);

    extractor::fetch_metadata(&url, &ytdlp_path, cookies_from.as_deref()).await
}

// ---------------------------------------------------------------------------
// Download lifecycle
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    format: Option<String>,
    quality: Option<String>,
    title: Option<String>,
) -> Result<String> {
    let url = url.trim().to_owned();
    if url.is_empty() {
        return Err(AppError::InvalidInput("url must not be empty".to_owned()));
    }
    resolve_ytdlp(&state).await?;

    let download_id = enqueue_url(&state, url, format, quality, title).await?;
    tracing::info!("QUEUE: item added — {download_id}");
    state.queue_notify.notify_one();
    let _ = app.emit("queue:changed", ());
    Ok(download_id)
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, download_id: String) -> Result<()> {
    let download_id = download_id.trim().to_owned();
    if download_id.is_empty() {
        return Err(AppError::InvalidInput(
            "download_id must not be empty".to_owned(),
        ));
    }

    let cancel_flag = {
        let guard = state
            .active_downloads
            .lock()
            .map_err(|e| AppError::Other(e.to_string()))?;
        guard.get(&download_id).map(|h| Arc::clone(&h.cancel_flag))
    };

    match cancel_flag {
        Some(flag) => {
            flag.store(true, Ordering::SeqCst);
            Ok(())
        }
        None => Err(AppError::NotFound(format!(
            "no active download with id {download_id}"
        ))),
    }
}

#[tauri::command]
pub async fn get_download(state: State<'_, AppState>, download_id: String) -> Result<Download> {
    let download_id = download_id.trim().to_owned();
    if download_id.is_empty() {
        return Err(AppError::InvalidInput(
            "download_id must not be empty".to_owned(),
        ));
    }

    let db = Arc::clone(&state.db);
    let id = download_id.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::get_download(&conn, &id)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    result.ok_or_else(|| AppError::NotFound(format!("download {download_id} not found")))
}

#[tauri::command]
pub async fn list_downloads(
    state: State<'_, AppState>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Download>> {
    if limit < 1 || limit > 500 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 500".to_owned(),
        ));
    }
    if offset < 0 {
        return Err(AppError::InvalidInput(
            "offset must not be negative".to_owned(),
        ));
    }

    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let rows = database::list_downloads(&conn, limit, offset)?;
        Ok(rows)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

// ---------------------------------------------------------------------------
// File-system actions
// ---------------------------------------------------------------------------

/// Opens the file at `path` with the OS default application.
/// Uses the tauri-plugin-opener backend (no separate frontend JS package needed).
#[tauri::command]
pub async fn open_file(app: AppHandle, path: String) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = path.trim().to_owned();

    if path.is_empty() {
        return Err(AppError::InvalidInput("path must not be empty".to_owned()));
    }
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Reveals the file or directory at `path` in the OS file manager
/// (Explorer on Windows, Finder on macOS, Nautilus/Dolphin on Linux).
#[tauri::command]
pub async fn reveal_in_folder(app: AppHandle, path: String) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = path.trim().to_owned();

    if path.is_empty() {
        return Err(AppError::InvalidInput("path must not be empty".to_owned()));
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Permanently deletes a single download record from the database.
/// The caller is responsible for confirming the deletion in the UI.
#[tauri::command]
pub async fn delete_download(
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();
    if id.is_empty() {
        return Err(AppError::InvalidInput(
            "download_id must not be empty".to_owned(),
        ));
    }
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::delete_download(&conn, &id)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

/// A single pending queue entry returned to the frontend.
#[derive(Debug, Serialize)]
pub struct QueueItem {
    pub download_id: String,
    pub position: i64,
    pub title: Option<String>,
    pub url: String,
    pub status: String,
    pub format: Option<String>,
    pub quality: Option<String>,
    pub progress: f64,
}

/// Returns all items currently waiting in queue_order, ordered by position.
#[tauri::command]
pub async fn get_queue(state: State<'_, AppState>) -> Result<Vec<QueueItem>> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let entries = database::queue_list_with_positions(&conn)?;
        let mut out = Vec::new();
        for (did, pos) in entries {
            if let Some(dl) = database::get_download(&conn, &did)? {
                out.push(QueueItem {
                    download_id: did,
                    position: pos,
                    title: dl.title,
                    url: dl.url,
                    status: dl.status.to_string(),
                    format: dl.format,
                    quality: dl.quality,
                    progress: dl.progress,
                });
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

/// Swaps the queued item with the one immediately above it (lower position).
#[tauri::command]
pub async fn queue_move_up(
    app: AppHandle,
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();
    let db = Arc::clone(&state.db);
    let id2 = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let items = database::queue_list_with_positions(&conn)?;
        let idx = items
            .iter()
            .position(|(did, _)| did == &id2)
            .ok_or_else(|| AppError::NotFound(format!("{id2} not in queue")))?;
        if idx == 0 {
            return Ok(()); // already first
        }
        database::queue_swap_positions(&conn, &items[idx].0, &items[idx - 1].0)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    let _ = app.emit("queue:changed", ());
    Ok(())
}

/// Swaps the queued item with the one immediately below it (higher position).
#[tauri::command]
pub async fn queue_move_down(
    app: AppHandle,
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();
    let db = Arc::clone(&state.db);
    let id2 = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let items = database::queue_list_with_positions(&conn)?;
        let idx = items
            .iter()
            .position(|(did, _)| did == &id2)
            .ok_or_else(|| AppError::NotFound(format!("{id2} not in queue")))?;
        if idx + 1 >= items.len() {
            return Ok(()); // already last
        }
        database::queue_swap_positions(&conn, &items[idx].0, &items[idx + 1].0)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    let _ = app.emit("queue:changed", ());
    Ok(())
}

/// Removes an item from the queue.
/// - If actively downloading: sets the cancel flag (finish path emits the event).
/// - If only queued: removes from queue_order, marks cancelled, emits download:cancelled.
#[tauri::command]
pub async fn queue_remove_item(
    app: AppHandle,
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();

    let cancel_flag = {
        state
            .active_downloads
            .lock()
            .map_err(|e| AppError::Other(e.to_string()))?
            .get(&id)
            .map(|h| Arc::clone(&h.cancel_flag))
    };

    if let Some(flag) = cancel_flag {
        flag.store(true, Ordering::SeqCst);
    } else {
        let db = Arc::clone(&state.db);
        let id2 = id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
            let _ = database::queue_remove(&conn, &id2);
            database::update_download_status(&conn, &id2, DownloadStatus::Cancelled)
        })
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;

        let _ = app.emit(
            "download:cancelled",
            serde_json::json!({ "download_id": id }),
        );
        let _ = app.emit("queue:changed", ());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Inserts a download record and pushes it onto queue_order.
/// Callers must call `state.queue_notify.notify_one()` and emit `queue:changed`
/// after all enqueue calls are done.
async fn enqueue_url(
    state: &AppState,
    url: String,
    format: Option<String>,
    quality: Option<String>,
    title: Option<String>,
) -> Result<String> {
    let (default_format, default_quality) = {
        let s = state
            .settings
            .read()
            .map_err(|e| AppError::Other(e.to_string()))?;
        (s.default_format.clone(), s.default_quality.clone())
    };

    let format = format
        .map(|f| f.trim().to_owned())
        .filter(|f| !f.is_empty())
        .unwrap_or(default_format);
    let quality = quality
        .map(|q| q.trim().to_owned())
        .filter(|q| !q.is_empty())
        .unwrap_or(default_quality);
    let title = title.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty());

    let download_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let record = Download {
        id: download_id.clone(),
        url,
        title,
        status: DownloadStatus::Queued,
        format: Some(format),
        quality: Some(quality),
        output_path: None,
        file_size: None,
        downloaded_bytes: 0,
        progress: 0.0,
        error_message: None,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
    };

    let db = Arc::clone(&state.db);
    let did2 = download_id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::insert_download(&conn, &record)?;
        database::queue_push(&conn, &did2)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    Ok(download_id)
}

/// Returns true if the URL looks like a supported YouTube video / playlist / channel.
fn is_youtube_url(url: &str) -> bool {
    let u = url.trim().to_lowercase();
    u.contains("youtube.com/watch")
        || u.contains("youtu.be/")
        || u.contains("youtube.com/playlist")
        || u.contains("youtube.com/shorts/")
        || u.contains("youtube.com/@")
        || u.contains("youtube.com/c/")
        || u.contains("youtube.com/channel/")
        || u.contains("youtube.com/user/")
        || u.contains("m.youtube.com/watch")
        || u.contains("music.youtube.com/watch")
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/// Tests whether the configured browser's cookie store is accessible and
/// contains valid YouTube authentication.  Runs a dry-run fetch of a known
/// public video with `--simulate` so no bytes are downloaded.
///
/// Returns a success message on pass, or a friendly error on failure.
#[tauri::command]
pub async fn test_auth(state: State<'_, AppState>) -> Result<String> {
    let ytdlp_path = resolve_ytdlp(&state).await?;

    let cookie_source = state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))?
        .cookie_source
        .clone();

    let browser = cookie_source.as_ytdlp_arg().ok_or_else(|| {
        AppError::InvalidInput(
            "Authentication is disabled. Select a browser in Settings → Authentication.".to_owned(),
        )
    })?;

    tracing::info!("test_auth: checking cookies from {browser}");

    let output = tokio::process::Command::new(&ytdlp_path)
        .args([
            "--cookies-from-browser",
            browser,
            "--simulate",
            "--no-playlist",
            "--no-warnings",
            "--socket-timeout",
            "15",
            // A known public video that requires sign-in to confirm not a bot
            // when accessed without cookies.
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(AppError::Io)?;

    if output.status.success() {
        Ok(format!(
            "Authentication test passed — {browser} cookies are working correctly."
        ))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        tracing::warn!("test_auth failed ({}): {}", browser, stderr.trim());
        Err(AppError::Process(
            downloader::classify_ytdlp_error(stderr.trim(), Some(browser)),
        ))
    }
}

// ---------------------------------------------------------------------------
// Playlist downloader
// ---------------------------------------------------------------------------

/// Fetches playlist or channel metadata (title, video list) without downloading.
/// `limit` caps results — useful for "Latest 10/25/50" channel modes.
#[tauri::command]
pub async fn fetch_playlist(
    state: State<'_, AppState>,
    url: String,
    limit: Option<u32>,
) -> Result<extractor::PlaylistMetadata> {
    let url = url.trim().to_owned();
    if url.is_empty() {
        return Err(AppError::InvalidInput("url must not be empty".to_owned()));
    }
    let ytdlp_path = resolve_ytdlp(&state).await?;
    let cookies_from = state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))?
        .cookie_source
        .as_ytdlp_arg()
        .map(str::to_owned);

    extractor::fetch_playlist(&url, &ytdlp_path, cookies_from.as_deref(), limit).await
}

/// Queues selected videos from a playlist/channel.
/// `entries` is a list of (url, title) pairs the user selected.
/// Returns how many were successfully enqueued.
#[tauri::command]
pub async fn start_playlist_download(
    app: AppHandle,
    state: State<'_, AppState>,
    playlist_url: String,
    playlist_title: Option<String>,
    playlist_thumbnail: Option<String>,
    entries: Vec<PlaylistDownloadEntry>,
    format: Option<String>,
    quality: Option<String>,
) -> Result<u32> {
    if entries.is_empty() {
        return Err(AppError::InvalidInput(
            "no videos selected".to_owned(),
        ));
    }
    resolve_ytdlp(&state).await?;

    let total = entries.len();
    let mut queued: u32 = 0;

    for entry in &entries {
        let url = entry.url.trim().to_owned();
        if url.is_empty() {
            continue;
        }
        match enqueue_url(
            &state,
            url,
            format.clone(),
            quality.clone(),
            Some(entry.title.clone()),
        )
        .await
        {
            Ok(_) => queued += 1,
            Err(e) => tracing::warn!("playlist enqueue failed for {}: {e}", entry.url),
        }
    }

    // Persist job audit record
    let job_id = Uuid::new_v4().to_string();
    let db = Arc::clone(&state.db);
    let pu = playlist_url.clone();
    let pt = playlist_title.clone();
    let pth = playlist_thumbnail.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::insert_playlist_job(
            &conn,
            &job_id,
            &pu,
            pt.as_deref(),
            pth.as_deref(),
            total,
            queued as usize,
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    if queued > 0 {
        tracing::info!("QUEUE: playlist added {queued} items");
        state.queue_notify.notify_one();
        let _ = app.emit("queue:changed", ());
    }

    Ok(queued)
}

/// Queues selected videos from a channel fetch.
/// Internally delegates to `start_playlist_download` logic.
#[tauri::command]
pub async fn start_channel_download(
    app: AppHandle,
    state: State<'_, AppState>,
    channel_url: String,
    channel_name: Option<String>,
    channel_thumbnail: Option<String>,
    limit_mode: Option<String>,
    entries: Vec<PlaylistDownloadEntry>,
    format: Option<String>,
    quality: Option<String>,
) -> Result<u32> {
    if entries.is_empty() {
        return Err(AppError::InvalidInput("no videos selected".to_owned()));
    }
    resolve_ytdlp(&state).await?;

    let total = entries.len();
    let mut queued: u32 = 0;

    for entry in &entries {
        let url = entry.url.trim().to_owned();
        if url.is_empty() {
            continue;
        }
        match enqueue_url(
            &state,
            url,
            format.clone(),
            quality.clone(),
            Some(entry.title.clone()),
        )
        .await
        {
            Ok(_) => queued += 1,
            Err(e) => tracing::warn!("channel enqueue failed for {}: {e}", entry.url),
        }
    }

    let job_id = Uuid::new_v4().to_string();
    let db = Arc::clone(&state.db);
    let cu = channel_url.clone();
    let cn = channel_name.clone();
    let ct = channel_thumbnail.clone();
    let lm = limit_mode.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::insert_channel_job(
            &conn,
            &job_id,
            &cu,
            cn.as_deref(),
            ct.as_deref(),
            lm.as_deref(),
            total,
            queued as usize,
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    if queued > 0 {
        tracing::info!("QUEUE: channel added {queued} items");
        state.queue_notify.notify_one();
        let _ = app.emit("queue:changed", ());
    }

    Ok(queued)
}

// ---------------------------------------------------------------------------
// Batch import
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct PlaylistDownloadEntry {
    pub url: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct BatchValidationResult {
    pub valid_urls: Vec<String>,
    pub invalid_urls: Vec<String>,
    pub duplicate_urls: Vec<String>,
    pub valid_count: u32,
    pub invalid_count: u32,
    pub duplicate_count: u32,
}

/// Validates a list of raw URL strings (one per line from the textarea).
/// Returns counts + categorized URLs without queuing anything.
#[tauri::command]
pub async fn validate_batch_urls(raw_text: String) -> BatchValidationResult {
    let mut valid: Vec<String> = Vec::new();
    let mut invalid: Vec<String> = Vec::new();
    let mut duplicates: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for line in raw_text.lines() {
        let url = line.trim().to_owned();
        if url.is_empty() {
            continue;
        }
        if !is_youtube_url(&url) {
            invalid.push(url);
            continue;
        }
        let key = url.to_lowercase();
        if seen.contains(&key) {
            duplicates.push(url);
        } else {
            seen.insert(key);
            valid.push(url);
        }
    }

    let vc = valid.len() as u32;
    let ic = invalid.len() as u32;
    let dc = duplicates.len() as u32;
    BatchValidationResult {
        valid_urls: valid,
        invalid_urls: invalid,
        duplicate_urls: duplicates,
        valid_count: vc,
        invalid_count: ic,
        duplicate_count: dc,
    }
}

/// Queues all valid URLs from the batch import.
#[tauri::command]
pub async fn start_batch_download(
    app: AppHandle,
    state: State<'_, AppState>,
    urls: Vec<String>,
    format: Option<String>,
    quality: Option<String>,
) -> Result<BatchValidationResult> {
    if urls.is_empty() {
        return Err(AppError::InvalidInput("no URLs provided".to_owned()));
    }
    resolve_ytdlp(&state).await?;

    let mut valid: Vec<String> = Vec::new();
    let mut invalid: Vec<String> = Vec::new();
    let mut duplicates: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // First pass: validate + deduplicate
    for url in &urls {
        let url = url.trim().to_owned();
        if url.is_empty() {
            continue;
        }
        if !is_youtube_url(&url) {
            invalid.push(url);
            continue;
        }
        let key = url.to_lowercase();
        if seen.contains(&key) {
            duplicates.push(url);
        } else {
            seen.insert(key);
            valid.push(url);
        }
    }

    // Second pass: enqueue valid
    let mut queued_count: u32 = 0;
    for url in &valid {
        match enqueue_url(
            &state,
            url.clone(),
            format.clone(),
            quality.clone(),
            None,
        )
        .await
        {
            Ok(_) => queued_count += 1,
            Err(e) => tracing::warn!("batch enqueue failed for {url}: {e}"),
        }
    }

    // Persist audit record
    let job_id = Uuid::new_v4().to_string();
    let total_count = urls.len();
    let valid_count = valid.len();
    let invalid_count = invalid.len();
    let duplicate_count = duplicates.len();
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::insert_batch_import(
            &conn,
            &job_id,
            total_count,
            valid_count,
            invalid_count,
            duplicate_count,
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    if queued_count > 0 {
        tracing::info!("QUEUE: batch added {queued_count} items");
        state.queue_notify.notify_one();
        let _ = app.emit("queue:changed", ());
    }

    let vc = valid.len() as u32;
    let ic = invalid.len() as u32;
    let dc = duplicates.len() as u32;
    Ok(BatchValidationResult {
        valid_urls: valid,
        invalid_urls: invalid,
        duplicate_urls: duplicates,
        valid_count: vc,
        invalid_count: ic,
        duplicate_count: dc,
    })
}

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------

/// Pauses an active download by setting both the pause flag and the cancel
/// flag.  The downloader detects pause_flag and marks the record as "paused"
/// instead of "cancelled", preserving downloaded_bytes for resumption.
#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, download_id: String) -> Result<()> {
    let id = download_id.trim().to_owned();
    if id.is_empty() {
        return Err(AppError::InvalidInput("download_id must not be empty".to_owned()));
    }

    let (cancel_flag, pause_flag) = {
        let guard = state
            .active_downloads
            .lock()
            .map_err(|e| AppError::Other(e.to_string()))?;
        let h = guard
            .get(&id)
            .ok_or_else(|| AppError::NotFound(format!("no active download: {id}")))?;
        (Arc::clone(&h.cancel_flag), Arc::clone(&h.pause_flag))
    };

    pause_flag.store(true, Ordering::SeqCst);
    cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}

/// Resumes a paused (or failed) download by re-inserting it into queue_order.
/// The queue worker will pass `--continue` to yt-dlp if downloaded_bytes > 0.
#[tauri::command]
pub async fn resume_download(
    app: AppHandle,
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();
    if id.is_empty() {
        return Err(AppError::InvalidInput("download_id must not be empty".to_owned()));
    }

    resolve_ytdlp(&state).await?;

    let db = Arc::clone(&state.db);
    let id2 = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        database::clear_download_error(&conn, &id2)?;
        database::update_download_status(&conn, &id2, database::DownloadStatus::Queued)?;
        database::queue_push(&conn, &id2)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    tracing::info!("QUEUE: resume enqueued — {id}");
    state.queue_notify.notify_one();
    let _ = app.emit("queue:changed", ());
    Ok(())
}

// ---------------------------------------------------------------------------
// Queue — move to top / bottom
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn queue_move_to_top(
    app: AppHandle,
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();
    let db = Arc::clone(&state.db);
    let id2 = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let min: i64 = conn
            .query_row(
                "SELECT COALESCE(MIN(position), 1) FROM queue_order",
                [],
                |row| row.get(0),
            )
            .unwrap_or(1);
        database::queue_reorder(&conn, &id2, min - 10)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    let _ = app.emit("queue:changed", ());
    Ok(())
}

#[tauri::command]
pub async fn queue_move_to_bottom(
    app: AppHandle,
    state: State<'_, AppState>,
    download_id: String,
) -> Result<()> {
    let id = download_id.trim().to_owned();
    let db = Arc::clone(&state.db);
    let id2 = id.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let max: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) FROM queue_order",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        database::queue_reorder(&conn, &id2, max + 10)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    let _ = app.emit("queue:changed", ());
    Ok(())
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct AppStatistics {
    pub total_downloads: i64,
    pub completed_count: i64,
    pub failed_count: i64,
    pub paused_count: i64,
    pub total_bytes: i64,
    pub today_bytes: i64,
    pub today_count: i64,
}

#[tauri::command]
pub async fn get_statistics(state: State<'_, AppState>) -> Result<AppStatistics> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;

        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM downloads", [], |r| r.get(0),
        )?;
        let completed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE status='completed'", [], |r| r.get(0),
        )?;
        let failed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE status='failed'", [], |r| r.get(0),
        )?;
        let paused: i64 = conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE status='paused'", [], |r| r.get(0),
        )?;
        let total_bytes: i64 = conn.query_row(
            "SELECT COALESCE(SUM(COALESCE(file_size, downloaded_bytes)), 0) \
             FROM downloads WHERE status='completed'",
            [], |r| r.get(0),
        )?;
        let today_bytes: i64 = conn.query_row(
            "SELECT COALESCE(SUM(COALESCE(file_size, downloaded_bytes)), 0) \
             FROM downloads WHERE status='completed' AND date(completed_at) = date('now')",
            [], |r| r.get(0),
        )?;
        let today_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE status='completed' \
             AND date(completed_at) = date('now')",
            [], |r| r.get(0),
        )?;

        Ok::<_, AppError>(AppStatistics {
            total_downloads: total,
            completed_count: completed,
            failed_count: failed,
            paused_count: paused,
            total_bytes,
            today_bytes,
            today_count,
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

// ---------------------------------------------------------------------------
// System information — About page
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub app_version: String,
    pub os_name: String,
    pub os_arch: String,
    pub ytdlp_version: Option<String>,
    pub ffmpeg_version: Option<String>,
}

#[tauri::command]
pub async fn get_system_info(state: State<'_, AppState>) -> Result<SystemInfo> {
    let app_version = env!("CARGO_PKG_VERSION").to_owned();

    let os_name = match std::env::consts::OS {
        "windows" => "Windows".to_owned(),
        "macos"   => "macOS".to_owned(),
        "linux"   => "Linux".to_owned(),
        other     => other.to_owned(),
    };
    let os_arch = std::env::consts::ARCH.to_owned();

    let ytdlp_path = state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))?
        .ytdlp_path
        .clone();

    let ytdlp_version = if let Some(path) = ytdlp_path {
        let out = tokio::process::Command::new(&path)
            .arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .output()
            .await;
        match out {
            Ok(o) if o.status.success() => {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_owned())
            }
            _ => None,
        }
    } else {
        None
    };

    let ffmpeg_path = state
        .settings
        .read()
        .map_err(|e| AppError::Other(e.to_string()))?
        .ffmpeg_path
        .clone();

    let ffmpeg_version = if let Some(path) = ffmpeg_path {
        crate::media::validate_ffmpeg(&path).await.ok()
    } else {
        None
    };

    Ok(SystemInfo {
        app_version,
        os_name,
        os_arch,
        ytdlp_version,
        ffmpeg_version,
    })
}

// ---------------------------------------------------------------------------
// Crash recovery — resume all paused
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn resume_all_paused(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<u32> {
    resolve_ytdlp(&state).await?;

    let db = Arc::clone(&state.db);
    let count = tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| AppError::Other(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id FROM downloads WHERE status='paused' ORDER BY updated_at ASC",
        )?;
        let ids: Vec<String> = stmt
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;

        for id in &ids {
            database::update_download_status(&conn, id, database::DownloadStatus::Queued)?;
            database::queue_push(&conn, id)?;
        }

        Ok::<_, AppError>(ids.len() as u32)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    if count > 0 {
        tracing::info!("QUEUE: resumed {count} paused downloads");
        state.queue_notify.notify_one();
        let _ = app.emit("queue:changed", ());
    }

    Ok(count)
}
