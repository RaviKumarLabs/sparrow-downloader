pub mod progress;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::process_ext::NoWindowExt;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Notify;

use crate::database::{self, DownloadStatus};
use crate::error::{AppError, Result};
use crate::state::DownloadHandle;
use progress::{parse_progress_line, ProgressUpdate};

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
struct StartedPayload {
    download_id: String,
    title: Option<String>,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
struct ProgressPayload {
    download_id: String,
    progress: ProgressUpdate,
}

#[derive(Debug, Clone, Serialize)]
struct CompletedPayload {
    download_id: String,
    output_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct FailedPayload {
    download_id: String,
    error: String,
}

#[derive(Debug, Clone, Serialize)]
struct CancelledPayload {
    download_id: String,
}

// ---------------------------------------------------------------------------
// 1. Format selector builder
// ---------------------------------------------------------------------------

/// Converts a high-level (format, quality) pair into a yt-dlp format selector.
///
/// - Audio-only outputs (`mp3`, `m4a`, `opus`, `flac`, `wav`) select the best
///   audio stream and request a specific extension where possible.
/// - Video formats (`mp4`, `webm`, or any other string) combine a
///   `bestvideo+bestaudio` selector constrained by the requested height.
/// - If `format` is already a valid yt-dlp selector string (contains `+` or
///   `/`), it is passed through unchanged.
pub fn build_format_selector(format: &str, quality: &str) -> String {
    // Pass-through: caller already built a yt-dlp selector
    if format.contains('+') || format.contains('/') {
        return format.to_owned();
    }

    // Audio-only formats
    match format {
        "mp3"  => return "bestaudio[ext=mp3]/bestaudio/best".to_owned(),
        "m4a"  => return "bestaudio[ext=m4a]/bestaudio/best".to_owned(),
        "opus" => return "bestaudio[ext=opus]/bestaudio/best".to_owned(),
        "flac" => return "bestaudio[ext=flac]/bestaudio/best".to_owned(),
        "wav"  => return "bestaudio[ext=wav]/bestaudio/best".to_owned(),
        _      => {}
    }

    // Height cap derived from quality label
    let height_cap: Option<u32> = match quality {
        "2160p" => Some(2160),
        "1440p" => Some(1440),
        "1080p" => Some(1080),
        "720p"  => Some(720),
        "480p"  => Some(480),
        "360p"  => Some(360),
        _       => None,
    };

    // Container + codec preferences
    let (v_ext, a_ext) = match format {
        "webm" => ("webm", "webm"),
        _      => ("mp4", "m4a"),
    };

    match height_cap {
        Some(h) => format!(
            "bestvideo[height<={h}][ext={v_ext}]+bestaudio[ext={a_ext}]\
             /bestvideo[height<={h}]+bestaudio\
             /best[height<={h}]\
             /best"
        ),
        None => format!(
            "bestvideo[ext={v_ext}]+bestaudio[ext={a_ext}]\
             /bestvideo+bestaudio\
             /best"
        ),
    }
}

// ---------------------------------------------------------------------------
// 2. yt-dlp argument builder
// ---------------------------------------------------------------------------

/// Builds the complete argument list for a yt-dlp download invocation.
/// Does NOT include the binary name itself.
///
/// Output filename template: `%(title)s [%(id)s].%(ext)s` placed in
/// `output_dir`.  The `[id]` suffix prevents name collisions between videos
/// with identical titles.
pub fn build_yt_dlp_args(
    url: &str,
    format_selector: &str,
    output_dir: &Path,
    ffmpeg_path: Option<&Path>,
    cookies_from: Option<&str>,
    resume: bool,
) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    // Authentication: inject browser cookies when configured.
    // This resolves "Sign in to confirm you're not a bot" and
    // age-restricted / members-only videos.
    if let Some(browser) = cookies_from {
        args.extend([
            "--cookies-from-browser".to_owned(),
            browser.to_owned(),
        ]);
    }

    // Format selection
    args.extend(["-f".to_owned(), format_selector.to_owned()]);

    // Output directory and filename template
    args.extend(["-P".to_owned(), output_dir.to_string_lossy().into_owned()]);
    args.extend(["-o".to_owned(), "%(title)s [%(id)s].%(ext)s".to_owned()]);

    // Resume a previously interrupted download
    if resume {
        args.push("-c".to_owned());
    }

    // Mux separate video+audio streams into a single mp4 container
    args.extend(["--merge-output-format".to_owned(), "mp4".to_owned()]);

    // Progress output: force \n so BufReader.lines() works correctly over a pipe.
    // --no-color strips ANSI escape codes that break the progress regex on Windows.
    args.push("--newline".to_owned());
    args.push("--progress".to_owned());
    args.push("--no-color".to_owned());

    // Reliability and scope guards
    args.push("--no-playlist".to_owned());
    args.push("--no-warnings".to_owned());
    args.extend(["--socket-timeout".to_owned(), "30".to_owned()]);
    args.extend(["--retries".to_owned(), "3".to_owned()]);
    args.extend(["--fragment-retries".to_owned(), "3".to_owned()]);

    // FFmpeg location for post-processing (muxing, format conversion)
    if let Some(path) = ffmpeg_path {
        args.extend([
            "--ffmpeg-location".to_owned(),
            path.to_string_lossy().into_owned(),
        ]);
    }

    // Print the definitive final output path after all post-processing.
    // The sentinel prefix lets us identify this line unambiguously in the
    // stdout stream. PYTHONUTF8=1 (set on the subprocess) ensures the path
    // is written as UTF-8, preserving Hindi text, emoji, full-width chars.
    args.extend([
        "--print".to_owned(),
        "after_move:YTDLP_FILEPATH:%(filepath)s".to_owned(),
    ]);

    // URL always last
    args.push(url.to_owned());

    args
}

/// Converts a raw yt-dlp stderr message into a user-friendly error string.
/// Detects bot-check / login-wall / cookie errors and surfacesthese with
/// actionable guidance instead of raw yt-dlp internals.
pub fn classify_ytdlp_error(stderr: &str, cookies_from: Option<&str>) -> String {
    let lower = stderr.to_lowercase();

    // Bot-check / sign-in wall
    if lower.contains("sign in to confirm")
        || lower.contains("bot")
        || lower.contains("use --cookies")
        || lower.contains("login required")
        || lower.contains("this video is available to this channel's members")
    {
        return if let Some(browser) = cookies_from {
            format!(
                "YouTube requires authentication but the {} cookies didn't work. \
                 Make sure you are signed in to YouTube in {} and try again. \
                 Close {} before downloading.",
                browser, browser, browser
            )
        } else {
            "YouTube requires sign-in. Enable browser cookie authentication \
             in Settings → Authentication and select your browser."
                .to_owned()
        };
    }

    // Cookie / keychain access errors
    if lower.contains("could not find") && lower.contains("cookie") {
        let browser = cookies_from.unwrap_or("the selected browser");
        return format!(
            "Could not read cookies from {browser}. \
             Make sure {browser} is installed and you have visited YouTube at least once."
        );
    }
    if lower.contains("permission denied") || lower.contains("access is denied") {
        let browser = cookies_from.unwrap_or("the browser");
        return format!(
            "Permission denied reading {browser} cookies. \
             Close {browser} completely and try again."
        );
    }
    if lower.contains("keyring") || lower.contains("keychain") || lower.contains("gnome-keyring") {
        return "Could not access the system keyring to decrypt browser cookies. \
                Try running the app from a graphical session."
            .to_owned();
    }

    // Age restriction without cookies
    if lower.contains("age") && (lower.contains("restricted") || lower.contains("limit")) {
        return "This video is age-restricted. \
                Enable browser cookie authentication in Settings → Authentication."
            .to_owned();
    }

    // Geo-block
    if lower.contains("not available in your country")
        || lower.contains("geo")
        || lower.contains("blocked")
    {
        return "This video is not available in your region.".to_owned();
    }

    // Fallback: first non-empty stderr line, stripped of yt-dlp prefixes
    stderr
        .lines()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim().trim_start_matches("ERROR:").trim().to_owned())
        .unwrap_or_else(|| "yt-dlp exited with an error".to_owned())
}

// ---------------------------------------------------------------------------
// 3. start() — registers handle, updates DB, spawns task
// ---------------------------------------------------------------------------

/// Registers a `DownloadHandle`, marks the record as `Downloading` in the
/// database, emits `download:started`, and spawns `run_download` as a
/// background Tokio task.  Returns as soon as the task is scheduled.
///
/// `queue_notify` is fired when the download reaches any terminal state so the
/// queue worker wakes and can start the next pending item.
pub async fn start(
    app: AppHandle,
    db: Arc<Mutex<rusqlite::Connection>>,
    active_downloads: Arc<Mutex<HashMap<String, DownloadHandle>>>,
    download_id: String,
    title: Option<String>,
    url: String,
    format_selector: String,
    output_dir: PathBuf,
    ytdlp_path: PathBuf,
    ffmpeg_path: Option<PathBuf>,
    cookies_from: Option<String>,
    resume: bool,
    queue_notify: Arc<Notify>,
) -> Result<()> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let pause_flag  = Arc::new(AtomicBool::new(false));
    let child_slot: Arc<tokio::sync::Mutex<Option<tokio::process::Child>>> =
        Arc::new(tokio::sync::Mutex::new(None));

    // Register before spawning: a cancel arriving in the window between
    // this function returning and the task being scheduled will find the entry.
    {
        let mut guard = active_downloads
            .lock()
            .map_err(|e| AppError::Other(e.to_string()))?;
        guard.insert(
            download_id.clone(),
            DownloadHandle {
                cancel_flag: Arc::clone(&cancel_flag),
                pause_flag: Arc::clone(&pause_flag),
                child: Arc::clone(&child_slot),
            },
        );
    }

    // Persist status change synchronously so the frontend sees it before the
    // first progress event.
    {
        let db2 = Arc::clone(&db);
        let id2 = download_id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db2.lock().expect("db lock poisoned");
            database::update_download_status(&conn, &id2, DownloadStatus::Downloading)
        })
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    }

    app.emit(
        "download:started",
        StartedPayload {
            download_id: download_id.clone(),
            title,
            url: url.clone(),
        },
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    tokio::spawn(run_download(
        app,
        db,
        active_downloads,
        download_id,
        url,
        format_selector,
        output_dir,
        ytdlp_path,
        ffmpeg_path,
        cookies_from,
        resume,
        cancel_flag,
        pause_flag,
        child_slot,
        queue_notify,
    ));

    Ok(())
}

// ---------------------------------------------------------------------------
// 4. run_download() — full process lifecycle (private, spawned by start)
// ---------------------------------------------------------------------------

async fn run_download(
    app: AppHandle,
    db: Arc<Mutex<rusqlite::Connection>>,
    active_downloads: Arc<Mutex<HashMap<String, DownloadHandle>>>,
    download_id: String,
    url: String,
    format_selector: String,
    output_dir: PathBuf,
    ytdlp_path: PathBuf,
    ffmpeg_path: Option<PathBuf>,
    cookies_from: Option<String>,
    resume: bool,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    child_slot: Arc<tokio::sync::Mutex<Option<tokio::process::Child>>>,
    queue_notify: Arc<Notify>,
) {
    let args = build_yt_dlp_args(
        &url,
        &format_selector,
        &output_dir,
        ffmpeg_path.as_deref(),
        cookies_from.as_deref(),
        resume,
    );

    // ---- Spawn subprocess ------------------------------------------------
    let mut proc = match tokio::process::Command::new(&ytdlp_path)
        .args(&args)
        // Force Python's stdout to UTF-8 so filenames with Devanagari, emoji,
        // and full-width punctuation survive the pipe intact.
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Safety net: if this task is dropped the child is killed automatically.
        .kill_on_drop(true)
        // Prevent a CMD window from flashing on Windows.
        .no_window()
        .spawn()
    {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("failed to spawn yt-dlp: {e}");
            tracing::error!("[{download_id}] {msg}");
            finish_failed(&app, &db, &active_downloads, &download_id, &msg, &queue_notify);
            return;
        }
    };

    // Take pipe handles before storing the child — the slot only needs the
    // process handle for wait() / kill().
    let stdout = proc.stdout.take().expect("stdout was piped");
    let stderr = proc.stderr.take().expect("stderr was piped");

    *child_slot.lock().await = Some(proc);

    // ---- Drain stderr concurrently so its pipe never fills ---------------
    // Uses read_until + from_utf8_lossy so non-UTF-8 bytes (Windows codepage
    // characters in filenames, progress bar glyphs, etc.) never abort the task.
    let stderr_task = tokio::spawn({
        let id = download_id.clone();
        async move {
            let mut buf = String::new();
            let mut raw_buf: Vec<u8> = Vec::with_capacity(512);
            let mut reader = BufReader::new(stderr);
            loop {
                raw_buf.clear();
                match reader.read_until(b'\n', &mut raw_buf).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        if raw_buf.ends_with(b"\n") { raw_buf.pop(); }
                        if raw_buf.ends_with(b"\r") { raw_buf.pop(); }
                        let line = String::from_utf8_lossy(&raw_buf);
                        tracing::info!("[{id}] STDERR: {:?}", &*line);
                        if let Some(update) = parse_progress_line(&line) {
                            tracing::warn!("[{id}] PROGRESS ON STDERR (bug): percent={:.1}", update.percent);
                        }
                        buf.push_str(&*line);
                        buf.push('\n');
                    }
                    Err(e) => {
                        tracing::warn!("[{id}] stderr read error: {e}");
                        break;
                    }
                }
            }
            buf
        }
    });

    // ---- Read stdout lines (raw bytes → lossy UTF-8) ---------------------
    // BufReader::lines() / next_line() returns Err on the first non-UTF-8 byte
    // and would break the loop immediately — silently killing progress parsing.
    // read_until() reads raw bytes; from_utf8_lossy() replaces bad bytes with
    // U+FFFD so the loop always continues regardless of encoding.
    let mut stdout_reader = BufReader::new(stdout);
    let mut raw_buf: Vec<u8> = Vec::with_capacity(512);
    let mut output_path: Option<String> = None; // from [Merger] / [download] Destination: lines
    let mut print_path: Option<String> = None;  // from --print after_move:YTDLP_FILEPATH: (authoritative)
    let mut last_db_pct: f64 = -1.0; // track last persisted percentage

    loop {
        // Check cancellation at the top of every iteration so we react
        // within one yt-dlp output line (~1 second) of the flag being set.
        if cancel_flag.load(Ordering::SeqCst) {
            let mut guard = child_slot.lock().await;
            if let Some(child) = guard.as_mut() {
                if let Err(e) = child.kill().await {
                    tracing::warn!("[{download_id}] kill error: {e}");
                }
            }
            break;
        }

        raw_buf.clear();
        match stdout_reader.read_until(b'\n', &mut raw_buf).await {
            Ok(0) => break, // EOF — stdout closed, process finished or killed
            Ok(_) => {
                // Strip trailing \r\n or \n before converting
                if raw_buf.ends_with(b"\n") { raw_buf.pop(); }
                if raw_buf.ends_with(b"\r") { raw_buf.pop(); }

                let line = String::from_utf8_lossy(&raw_buf);
                tracing::info!("[{download_id}] RAW PROGRESS: {:?}", &*line);

                // --print after_move:YTDLP_FILEPATH: sentinel — this is the
                // authoritative final path, emitted after merging and all moves.
                if let Some(path) = parse_final_path_line(&line) {
                    print_path = Some(path);
                    continue;
                }

                // Fallback path capture from log lines (used when --print isn't
                // supported by an older yt-dlp build).
                // [Merger] / [ffmpeg] line is checked FIRST because it arrives
                // after all [download] Destination: lines and names the final
                // merged file — the intermediate streams are deleted afterward.
                if let Some(path) = parse_merger_line(&line) {
                    output_path = Some(path);
                    continue;
                }
                if let Some(path) = parse_destination_line(&line) {
                    output_path = Some(path);
                    continue;
                }

                // Parse and fan out progress
                if let Some(update) = parse_progress_line(&line) {
                    tracing::info!("[{download_id}] PARSED: percent={:.1}", update.percent);
                    emit_progress(&app, &download_id, &update);
                    maybe_persist_progress(&db, &download_id, &update, &mut last_db_pct);
                } else if line.contains("[download]") {
                    tracing::info!("[{download_id}] NO MATCH: {:?}", &*line);
                }
            }
            Err(e) => {
                tracing::warn!("[{download_id}] stdout read error: {e}");
                break;
            }
        }
    }

    // ---- Wait for process to exit ----------------------------------------
    let exit_status = {
        let mut guard = child_slot.lock().await;
        match guard.as_mut() {
            Some(child) => child.wait().await.ok(),
            None => None,
        }
    };

    let stderr_output = stderr_task.await.unwrap_or_default();

    // ---- Determine outcome and emit final event --------------------------
    if cancel_flag.load(Ordering::SeqCst) {
        if pause_flag.load(Ordering::SeqCst) {
            finish_paused(&app, &db, &active_downloads, &download_id, &queue_notify);
        } else {
            finish_cancelled(&app, &db, &active_downloads, &download_id, &queue_notify);
        }
        return;
    }

    match exit_status {
        Some(status) if status.success() => {
            // print_path (from --print after_move) is authoritative: it is the
            // exact path yt-dlp recorded on disk, byte-for-byte.  Fall back to
            // the log-line heuristic only if --print produced nothing.
            let final_path = print_path.or(output_path);
            finish_completed(&app, &db, &active_downloads, &download_id, final_path, &queue_notify);
        }
        Some(status) => {
            tracing::error!("[{download_id}] yt-dlp exited with {status}");
            let msg = classify_ytdlp_error(stderr_output.trim(), cookies_from.as_deref());
            finish_failed(&app, &db, &active_downloads, &download_id, &msg, &queue_notify);
        }
        None => {
            finish_cancelled(&app, &db, &active_downloads, &download_id, &queue_notify);
        }
    }
}

// ---------------------------------------------------------------------------
// Outcome helpers — centralise the event + DB writes for each terminal state
// ---------------------------------------------------------------------------

fn finish_completed(
    app: &AppHandle,
    db: &Arc<Mutex<rusqlite::Connection>>,
    active: &Arc<Mutex<HashMap<String, DownloadHandle>>>,
    id: &str,
    output_path: Option<String>,
    queue_notify: &Arc<Notify>,
) {
    tracing::info!("QUEUE: download completed — {id}");

    let db2  = Arc::clone(db);
    let id2  = id.to_owned();
    let path = output_path.clone();
    tokio::task::spawn_blocking(move || match db2.lock() {
        Ok(conn) => {
            if let Err(e) = database::complete_download(&conn, &id2, path.as_deref()) {
                tracing::warn!("[{id2}] complete_download db write failed: {e}");
            }
        }
        Err(e) => tracing::warn!("[{id2}] db lock poisoned: {e}"),
    });
    let _ = app.emit(
        "download:completed",
        CompletedPayload {
            download_id: id.to_owned(),
            output_path,
        },
    );
    deregister(active, id);
    queue_notify.notify_one();
}

fn finish_failed(
    app: &AppHandle,
    db: &Arc<Mutex<rusqlite::Connection>>,
    active: &Arc<Mutex<HashMap<String, DownloadHandle>>>,
    id: &str,
    error: &str,
    queue_notify: &Arc<Notify>,
) {
    db_set_error(db, id, error);
    db_set_status(db, id, DownloadStatus::Failed);
    let _ = app.emit(
        "download:failed",
        FailedPayload {
            download_id: id.to_owned(),
            error: error.to_owned(),
        },
    );
    deregister(active, id);
    queue_notify.notify_one();
}

fn finish_cancelled(
    app: &AppHandle,
    db: &Arc<Mutex<rusqlite::Connection>>,
    active: &Arc<Mutex<HashMap<String, DownloadHandle>>>,
    id: &str,
    queue_notify: &Arc<Notify>,
) {
    db_set_status(db, id, DownloadStatus::Cancelled);
    let _ = app.emit(
        "download:cancelled",
        CancelledPayload { download_id: id.to_owned() },
    );
    deregister(active, id);
    queue_notify.notify_one();
}

fn finish_paused(
    app: &AppHandle,
    db: &Arc<Mutex<rusqlite::Connection>>,
    active: &Arc<Mutex<HashMap<String, DownloadHandle>>>,
    id: &str,
    queue_notify: &Arc<Notify>,
) {
    db_set_status(db, id, DownloadStatus::Paused);
    let _ = app.emit(
        "download:paused",
        serde_json::json!({ "download_id": id }),
    );
    deregister(active, id);
    queue_notify.notify_one();
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Parses the sentinel line emitted by `--print after_move:YTDLP_FILEPATH:%(filepath)s`.
/// This is the definitive path after all merging and post-processing moves —
/// identical byte-for-byte to what is on disk when PYTHONUTF8=1 is set.
fn parse_final_path_line(line: &str) -> Option<String> {
    line.trim().strip_prefix("YTDLP_FILEPATH:").map(str::to_owned)
}

/// Parses the yt-dlp destination notice for a single-stream download:
/// `[download] Destination: /path/to/file.mp4`
fn parse_destination_line(line: &str) -> Option<String> {
    line.trim()
        .strip_prefix("[download] Destination: ")
        .map(str::to_owned)
}

/// Parses the yt-dlp merger notice for multi-stream (video+audio) downloads.
/// yt-dlp emits this AFTER deleting the intermediate streams, so this path
/// points to the final kept file:
/// `[Merger] Merging formats into "/path/to/file.mp4"`
/// `[ffmpeg] Merging formats into "/path/to/file.mp4"`
fn parse_merger_line(line: &str) -> Option<String> {
    let line = line.trim();
    for prefix in &[
        "[Merger] Merging formats into \"",
        "[ffmpeg] Merging formats into \"",
    ] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return rest.strip_suffix('"').map(str::to_owned);
        }
    }
    None
}

/// Emits a `download:progress` event, ignoring send errors.
fn emit_progress(app: &AppHandle, download_id: &str, update: &ProgressUpdate) {
    if let Err(e) = app.emit(
        "download:progress",
        ProgressPayload {
            download_id: download_id.to_owned(),
            progress: update.clone(),
        },
    ) {
        tracing::warn!("[{download_id}] progress emit error: {e}");
    }
}

/// Persists progress to the database at most once per whole-integer percent
/// boundary to limit write frequency (~100 writes per download maximum).
/// The DB call is fire-and-forget: errors are logged, not propagated.
fn maybe_persist_progress(
    db: &Arc<Mutex<rusqlite::Connection>>,
    download_id: &str,
    update: &ProgressUpdate,
    last_db_pct: &mut f64,
) {
    if update.percent.floor() <= last_db_pct.floor() {
        return;
    }
    *last_db_pct = update.percent;

    let db2 = Arc::clone(db);
    let id2 = download_id.to_owned();
    let dl  = update.downloaded_bytes.unwrap_or(0) as i64;
    let pct = update.percent / 100.0;

    tokio::task::spawn_blocking(move || {
        match db2.lock() {
            Ok(conn) => {
                if let Err(e) = database::update_download_progress(&conn, &id2, dl, pct) {
                    tracing::warn!("[{id2}] progress db write failed: {e}");
                }
            }
            Err(e) => tracing::warn!("[{id2}] db lock poisoned: {e}"),
        }
    });
}

/// Synchronous DB status update called from async context via blocking.
/// Errors are logged; status transitions must not abort the outcome path.
fn db_set_status(
    db: &Arc<Mutex<rusqlite::Connection>>,
    id: &str,
    status: DownloadStatus,
) {
    let db2 = Arc::clone(db);
    let id2 = id.to_owned();
    // Use spawn_blocking so we don't block the async executor.
    // We intentionally do not await — callers are in cleanup paths.
    tokio::task::spawn_blocking(move || match db2.lock() {
        Ok(conn) => {
            if let Err(e) = database::update_download_status(&conn, &id2, status) {
                tracing::warn!("[{id2}] db status update failed: {e}");
            }
        }
        Err(e) => tracing::warn!("[{id2}] db lock poisoned: {e}"),
    });
}

fn db_set_error(db: &Arc<Mutex<rusqlite::Connection>>, id: &str, message: &str) {
    let db2 = Arc::clone(db);
    let id2 = id.to_owned();
    let msg = message.to_owned();
    tokio::task::spawn_blocking(move || match db2.lock() {
        Ok(conn) => {
            if let Err(e) = database::set_download_error(&conn, &id2, &msg) {
                tracing::warn!("[{id2}] db error write failed: {e}");
            }
        }
        Err(e) => tracing::warn!("[{id2}] db lock poisoned: {e}"),
    });
}

fn deregister(active: &Arc<Mutex<HashMap<String, DownloadHandle>>>, id: &str) {
    match active.lock() {
        Ok(mut guard) => { guard.remove(id); }
        Err(e) => tracing::warn!("[{id}] active_downloads lock poisoned: {e}"),
    }
}
