use std::path::Path;
use std::process::Stdio;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::process_ext::NoWindowExt;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Metadata for a single video as returned by yt-dlp --dump-single-json.
/// No playlist expansion — one URL produces exactly one VideoMetadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    /// yt-dlp internal video ID (e.g. "dQw4w9WgXcQ").
    pub id: String,

    pub title: String,

    /// Duration in fractional seconds; None if yt-dlp could not determine it.
    pub duration: Option<f64>,

    pub uploader: Option<String>,

    /// URL of the best available thumbnail image.
    pub thumbnail: Option<String>,

    /// Canonical URL of the video page.
    pub webpage_url: String,

    /// All format entries reported by yt-dlp, including video-only,
    /// audio-only, and muxed streams.
    pub formats: Vec<FormatInfo>,
}

/// One downloadable stream variant as reported by yt-dlp.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    /// yt-dlp format selector ID (e.g. "137", "bestvideo").
    pub format_id: String,

    /// Container extension (e.g. "mp4", "webm", "m4a").
    pub ext: String,

    /// Numeric quality score assigned by yt-dlp (higher is better).
    pub quality: Option<f64>,

    /// Human-readable quality label (e.g. "1080p", "720p60", "tiny").
    pub format_note: Option<String>,

    pub width: Option<i64>,
    pub height: Option<i64>,

    /// Frames per second; None for audio-only formats.
    pub fps: Option<f64>,

    /// Video codec string; None when the stream carries no video track.
    pub vcodec: Option<String>,

    /// Audio codec string; None when the stream carries no audio track.
    pub acodec: Option<String>,

    /// Exact file size in bytes if known.
    pub filesize: Option<i64>,

    /// Approximate file size used when the exact value is unavailable.
    pub filesize_approx: Option<i64>,

    /// Total bitrate in kbps.
    pub tbr: Option<f64>,

    /// Audio bitrate in kbps.
    pub abr: Option<f64>,

    /// Video bitrate in kbps.
    pub vbr: Option<f64>,

    /// True when the stream contains a video track.
    pub has_video: bool,

    /// True when the stream contains an audio track.
    pub has_audio: bool,
}

// ---------------------------------------------------------------------------
// Raw deserialization types (private — map to public types after parsing)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RawVideo {
    id: String,
    title: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    webpage_url: Option<String>,
    #[serde(default)]
    formats: Vec<RawFormat>,
}

#[derive(Deserialize)]
struct RawFormat {
    format_id: String,
    ext: String,
    #[serde(default)]
    quality: Option<f64>,
    #[serde(default)]
    format_note: Option<String>,
    #[serde(default)]
    width: Option<i64>,
    #[serde(default)]
    height: Option<i64>,
    #[serde(default)]
    fps: Option<f64>,
    #[serde(default)]
    vcodec: Option<String>,
    #[serde(default)]
    acodec: Option<String>,
    #[serde(default)]
    filesize: Option<i64>,
    #[serde(default)]
    filesize_approx: Option<i64>,
    #[serde(default)]
    tbr: Option<f64>,
    #[serde(default)]
    abr: Option<f64>,
    #[serde(default)]
    vbr: Option<f64>,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Invokes `yt-dlp --dump-single-json --no-playlist` and returns strongly
/// typed metadata.  No download is performed.  No database writes occur.
///
/// # Errors
/// - `AppError::Io`      — yt-dlp could not be spawned
/// - `AppError::Process` — yt-dlp exited non-zero (stderr included in message)
/// - `AppError::Json`    — stdout was not valid JSON / missing required fields
pub async fn fetch_metadata(
    url: &str,
    ytdlp_path: &Path,
    cookies_from: Option<&str>,
) -> Result<VideoMetadata> {
    let mut cmd = tokio::process::Command::new(ytdlp_path);

    // Inject browser cookies when authentication is configured.
    if let Some(browser) = cookies_from {
        cmd.args(["--cookies-from-browser", browser]);
    }

    cmd.args([
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "30",
        url,
    ]);

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .no_window()
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        let friendly = crate::downloader::classify_ytdlp_error(stderr.trim(), cookies_from);
        return Err(AppError::Process(friendly));
    }

    if output.stdout.is_empty() {
        return Err(AppError::Process(
            "yt-dlp produced no output".to_owned(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw: RawVideo = serde_json::from_str(&stdout)?;

    Ok(map_video(raw, url))
}

// ---------------------------------------------------------------------------
// Playlist / channel types
// ---------------------------------------------------------------------------

/// A single video entry returned from a flat-playlist fetch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistEntry {
    pub id: String,
    pub title: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub url: String,
    pub uploader: Option<String>,
    pub playlist_index: Option<u32>,
}

/// Top-level playlist (or channel) metadata including all flat entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistMetadata {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub thumbnail: Option<String>,
    pub webpage_url: String,
    pub entry_count: usize,
    pub total_duration: Option<f64>,
    pub entries: Vec<PlaylistEntry>,
}

// ---------------------------------------------------------------------------
// Raw deserialization types for playlist
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RawPlaylist {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    webpage_url: Option<String>,
    #[serde(default)]
    entries: Vec<RawPlaylistEntry>,
}

#[derive(Deserialize)]
struct RawPlaylistEntry {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    playlist_index: Option<u32>,
}

// ---------------------------------------------------------------------------
// Playlist / channel fetch
// ---------------------------------------------------------------------------

/// Fetches playlist or channel metadata using `--flat-playlist --dump-single-json`.
/// When `limit` is `Some(n)`, passes `--playlist-end n` to cap the result.
pub async fn fetch_playlist(
    url: &str,
    ytdlp_path: &Path,
    cookies_from: Option<&str>,
    limit: Option<u32>,
) -> Result<PlaylistMetadata> {
    let mut cmd = tokio::process::Command::new(ytdlp_path);

    if let Some(browser) = cookies_from {
        cmd.args(["--cookies-from-browser", browser]);
    }

    let mut args: Vec<String> = vec![
        "--flat-playlist".into(),
        "--dump-single-json".into(),
        "--no-warnings".into(),
        "--socket-timeout".into(),
        "60".into(),
    ];

    if let Some(end) = limit {
        args.push("--playlist-end".into());
        args.push(end.to_string());
    }

    args.push(url.to_owned());
    cmd.args(&args);

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .no_window()
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        let friendly = crate::downloader::classify_ytdlp_error(stderr.trim(), cookies_from);
        return Err(AppError::Process(friendly));
    }

    if output.stdout.is_empty() {
        return Err(AppError::Process(
            "yt-dlp produced no output for this URL".to_owned(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw: RawPlaylist = serde_json::from_str(&stdout)?;
    Ok(map_playlist(raw, url))
}

// ---------------------------------------------------------------------------
// Private mapping helpers
// ---------------------------------------------------------------------------

fn map_video(raw: RawVideo, fallback_url: &str) -> VideoMetadata {
    let formats = raw.formats.into_iter().map(map_format).collect();

    VideoMetadata {
        id: raw.id,
        title: raw.title,
        duration: raw.duration,
        uploader: raw.uploader,
        thumbnail: raw.thumbnail,
        webpage_url: raw.webpage_url.unwrap_or_else(|| fallback_url.to_owned()),
        formats,
    }
}

fn map_format(raw: RawFormat) -> FormatInfo {
    // yt-dlp uses the string "none" when a codec track is absent.
    // Normalise to Option::None so callers get a clean boolean check.
    let vcodec = raw.vcodec.filter(|v| v != "none");
    let acodec = raw.acodec.filter(|a| a != "none");

    let has_video = vcodec.is_some();
    let has_audio = acodec.is_some();

    FormatInfo {
        format_id: raw.format_id,
        ext: raw.ext,
        quality: raw.quality,
        format_note: raw.format_note,
        width: raw.width,
        height: raw.height,
        fps: raw.fps,
        vcodec,
        acodec,
        filesize: raw.filesize,
        filesize_approx: raw.filesize_approx,
        tbr: raw.tbr,
        abr: raw.abr,
        vbr: raw.vbr,
        has_video,
        has_audio,
    }
}

fn map_playlist(raw: RawPlaylist, fallback_url: &str) -> PlaylistMetadata {
    let total_duration: Option<f64> = {
        let sum: f64 = raw.entries.iter().filter_map(|e| e.duration).sum();
        if sum > 0.0 { Some(sum) } else { None }
    };

    let entry_count = raw.entries.len();

    let entries = raw
        .entries
        .into_iter()
        .enumerate()
        .map(|(i, e)| {
            let id = e.id.unwrap_or_else(|| format!("entry-{i}"));
            let url = e
                .url
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={id}"));
            PlaylistEntry {
                id: id.clone(),
                title: e.title.unwrap_or_else(|| id.clone()),
                duration: e.duration,
                thumbnail: e.thumbnail,
                url,
                uploader: e.uploader,
                playlist_index: e.playlist_index.or(Some((i + 1) as u32)),
            }
        })
        .collect();

    PlaylistMetadata {
        id: raw.id.unwrap_or_else(|| "unknown".to_owned()),
        title: raw.title.unwrap_or_else(|| "Untitled Playlist".to_owned()),
        uploader: raw.uploader,
        thumbnail: raw.thumbnail,
        webpage_url: raw.webpage_url.unwrap_or_else(|| fallback_url.to_owned()),
        entry_count,
        total_duration,
        entries,
    }
}
