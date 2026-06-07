use std::path::PathBuf;
use std::process::Stdio;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::Result;

// ---------------------------------------------------------------------------
// Key constants — single source of truth for DB keys
// ---------------------------------------------------------------------------

const KEY_YTDLP_PATH:    &str = "ytdlp_path";
const KEY_FFMPEG_PATH:   &str = "ffmpeg_path";
const KEY_OUTPUT_DIR:    &str = "output_directory";
const KEY_MAX_CONC:      &str = "max_concurrent_downloads";
const KEY_DEF_FORMAT:    &str = "default_format";
const KEY_DEF_QUALITY:   &str = "default_quality";
const KEY_COOKIE_SOURCE: &str = "auth_cookie_source";
const KEY_NOTIF:         &str = "notifications_enabled";

// ---------------------------------------------------------------------------
// CookieSource — which browser's cookie store yt-dlp should use
// ---------------------------------------------------------------------------

/// Selects the browser whose cookie store yt-dlp reads for authenticated
/// requests.  Maps directly to yt-dlp's `--cookies-from-browser` argument.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CookieSource {
    /// No cookie injection — default, unauthenticated behaviour.
    #[default]
    Disabled,
    Chrome,
    Edge,
    Firefox,
    Brave,
}

impl CookieSource {
    /// Returns the browser name string accepted by yt-dlp's
    /// `--cookies-from-browser` flag, or `None` when disabled.
    pub fn as_ytdlp_arg(&self) -> Option<&'static str> {
        match self {
            Self::Disabled => None,
            Self::Chrome   => Some("chrome"),
            Self::Edge     => Some("edge"),
            Self::Firefox  => Some("firefox"),
            Self::Brave    => Some("brave"),
        }
    }
}

impl std::fmt::Display for CookieSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_ytdlp_arg().unwrap_or("disabled"))
    }
}

impl From<&str> for CookieSource {
    fn from(s: &str) -> Self {
        match s {
            "chrome"  => Self::Chrome,
            "edge"    => Self::Edge,
            "firefox" => Self::Firefox,
            "brave"   => Self::Brave,
            _         => Self::Disabled,
        }
    }
}

// ---------------------------------------------------------------------------
// Settings struct
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Absolute path to the yt-dlp executable, or None if not yet configured.
    pub ytdlp_path: Option<PathBuf>,

    /// Absolute path to the ffmpeg executable, or None if not yet configured.
    pub ffmpeg_path: Option<PathBuf>,

    /// Directory where completed downloads are saved.
    pub output_directory: PathBuf,

    /// Maximum number of simultaneous downloads (1–8).
    pub max_concurrent_downloads: u32,

    /// yt-dlp format selector string, e.g. "bestvideo+bestaudio/best".
    pub default_format: String,

    /// Human-readable quality label forwarded to the frontend picker.
    pub default_quality: String,

    /// Which browser's cookie store yt-dlp should use for authentication.
    /// Set to Chrome/Edge/Firefox/Brave to bypass "Sign in to confirm you're
    /// not a bot" and age-restricted / member-only videos.
    pub cookie_source: CookieSource,

    /// Whether desktop notifications are sent on download completion / failure.
    pub notifications_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ytdlp_path: None,
            ffmpeg_path: None,
            output_directory: default_output_dir(),
            max_concurrent_downloads: 2,
            default_format: String::from("bestvideo+bestaudio/best"),
            default_quality: String::from("best"),
            cookie_source: CookieSource::Disabled,
            notifications_enabled: true,
        }
    }
}

fn default_output_dir() -> PathBuf {
    // USERPROFILE  → Windows primary home env var
    // HOME         → Unix fallback
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("Downloads")
}

// ---------------------------------------------------------------------------
// Load / save via the database key-value store
// ---------------------------------------------------------------------------

impl Settings {
    /// Reads all keys from the settings table and deserialises them.
    /// Missing keys silently fall back to `Default::default()`.
    pub fn load_from_db(conn: &Connection) -> Result<Self> {
        let map = crate::database::settings_get_all(conn)?;
        let def = Self::default();

        let ytdlp_path = map
            .get(KEY_YTDLP_PATH)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from);

        let ffmpeg_path = map
            .get(KEY_FFMPEG_PATH)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from);

        let output_directory = map
            .get(KEY_OUTPUT_DIR)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or(def.output_directory);

        let max_concurrent_downloads = map
            .get(KEY_MAX_CONC)
            .and_then(|v| v.parse::<u32>().ok())
            .filter(|&n| n >= 1 && n <= 8)
            .unwrap_or(def.max_concurrent_downloads);

        let default_format = map
            .get(KEY_DEF_FORMAT)
            .cloned()
            .filter(|v| !v.is_empty())
            .unwrap_or(def.default_format);

        let default_quality = map
            .get(KEY_DEF_QUALITY)
            .cloned()
            .filter(|v| !v.is_empty())
            .unwrap_or(def.default_quality);

        let cookie_source = map
            .get(KEY_COOKIE_SOURCE)
            .map(|v| CookieSource::from(v.as_str()))
            .unwrap_or_default();

        let notifications_enabled = map
            .get(KEY_NOTIF)
            .map(|v| v != "false")
            .unwrap_or(true);

        Ok(Self {
            ytdlp_path,
            ffmpeg_path,
            output_directory,
            max_concurrent_downloads,
            default_format,
            default_quality,
            cookie_source,
            notifications_enabled,
        })
    }

    /// Persists every field to the settings table using UPSERT semantics
    /// (handled by `database::settings_set`).
    pub fn save_to_db(&self, conn: &Connection) -> Result<()> {
        let pairs: &[(&str, String)] = &[
            (
                KEY_YTDLP_PATH,
                self.ytdlp_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            ),
            (
                KEY_FFMPEG_PATH,
                self.ffmpeg_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            ),
            (
                KEY_OUTPUT_DIR,
                self.output_directory.to_string_lossy().into_owned(),
            ),
            (
                KEY_MAX_CONC,
                self.max_concurrent_downloads.to_string(),
            ),
            (KEY_DEF_FORMAT, self.default_format.clone()),
            (KEY_DEF_QUALITY, self.default_quality.clone()),
            (KEY_COOKIE_SOURCE, self.cookie_source.to_string()),
            (KEY_NOTIF, self.notifications_enabled.to_string()),
        ];

        for (key, value) in pairs {
            crate::database::settings_set(conn, key, value)?;
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Binary auto-detection
// ---------------------------------------------------------------------------

/// Returns the path to yt-dlp if it can be located, or `None`.
///
/// Search order:
/// 1. `where.exe` / `which` — queries the OS PATH reliably even when Tauri's
///    process environment inherits a reduced PATH from the launcher.
/// 2. Direct `probe_binary` via inherited PATH.
/// 3. Known Windows install locations (pip, pipx, scoop, chocolatey…).
pub fn detect_ytdlp_path() -> Option<PathBuf> {
    #[cfg(windows)]
    if let Some(p) = where_find("yt-dlp.exe") { return Some(p); }
    #[cfg(not(windows))]
    if let Some(p) = which_find("yt-dlp") { return Some(p); }

    let exe = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    if probe_binary(exe, "--version") {
        return Some(PathBuf::from(exe));
    }

    // WinGet (portable installer) places yt-dlp.exe under
    // %LOCALAPPDATA%\Microsoft\WinGet\Packages\<package-id>\yt-dlp.exe
    // and adds that *specific* subdirectory to HKCU\Environment\Path in the
    // registry.  When the Tauri app is launched from a desktop shortcut it
    // inherits explorer.exe's PATH from login, which does not include PATH
    // entries written to the registry after the last login.  Neither
    // where.exe nor probe_binary can find the binary in that case.
    // Scanning the Packages directory directly bypasses the stale PATH.
    #[cfg(windows)]
    if let Some(p) = scan_winget_packages("yt-dlp.exe") { return Some(p); }

    #[cfg(windows)]
    for candidate in ytdlp_windows_candidates() {
        if candidate.is_file() { return Some(candidate); }
    }

    None
}

/// Returns the path to ffmpeg if it can be located, or `None`.
pub fn detect_ffmpeg_path() -> Option<PathBuf> {
    #[cfg(windows)]
    if let Some(p) = where_find("ffmpeg.exe") { return Some(p); }
    #[cfg(not(windows))]
    if let Some(p) = which_find("ffmpeg") { return Some(p); }

    let exe = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    if probe_binary(exe, "-version") {
        return Some(PathBuf::from(exe));
    }

    #[cfg(windows)]
    if let Some(p) = scan_winget_packages("ffmpeg.exe") { return Some(p); }

    #[cfg(windows)]
    for candidate in ffmpeg_windows_candidates() {
        if candidate.is_file() { return Some(candidate); }
    }

    None
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Scans `%LOCALAPPDATA%\Microsoft\WinGet\Packages\` one level deep for
/// `name`.  WinGet portable installers place the binary in
/// `Packages\<package-id>\<name>` and add that subdirectory to
/// `HKCU\Environment\Path` in the registry.  The running process may not
/// inherit that PATH entry, so we check the filesystem directly.
#[cfg(windows)]
fn scan_winget_packages(name: &str) -> Option<PathBuf> {
    let packages = PathBuf::from(std::env::var("LOCALAPPDATA").ok()?)
        .join("Microsoft")
        .join("WinGet")
        .join("Packages");
    if !packages.is_dir() {
        return None;
    }
    for entry in std::fs::read_dir(&packages).ok()?.flatten() {
        let candidate = entry.path().join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Uses `where.exe` (Windows) to find an executable by name.
/// Both this and `probe_binary` search the *process-inherited* PATH — they are
/// equivalent for PATH coverage.  `where.exe` is kept as the first stage
/// because it handles PATHEXT resolution and returns the resolved absolute path,
/// which avoids the need to call `is_file()` with a bare name.
#[cfg(windows)]
fn where_find(name: &str) -> Option<PathBuf> {
    let out = std::process::Command::new("where.exe")
        .arg(name)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() { return None; }
    let text = String::from_utf8(out.stdout).ok()?;
    let first = text.lines().next()?.trim();
    let p = PathBuf::from(first);
    if p.is_file() { Some(p) } else { None }
}

#[cfg(not(windows))]
fn which_find(name: &str) -> Option<PathBuf> {
    let out = std::process::Command::new("which")
        .arg(name)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() { return None; }
    let p = PathBuf::from(String::from_utf8(out.stdout).ok()?.trim());
    if p.is_file() { Some(p) } else { None }
}

/// Runs `<name> <version_flag>` and returns true if the exit code is 0.
/// Any spawn error (e.g. binary not found) is treated as false.
fn probe_binary(name: &str, version_flag: &str) -> bool {
    std::process::Command::new(name)
        .arg(version_flag)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn ytdlp_windows_candidates() -> Vec<PathBuf> {
    let local   = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from);
    let appdata = std::env::var("APPDATA").ok().map(PathBuf::from);
    let home    = std::env::var("USERPROFILE").ok().map(PathBuf::from);

    let mut v = Vec::new();

    // winget — %LOCALAPPDATA%\Microsoft\WinGet\Links\ is added to the user
    // PATH registry entry by winget but may not be in the *process* PATH when
    // the app is launched in the same session as the install.
    if let Some(p) = &local {
        v.push(p.join("Microsoft").join("WinGet").join("Links").join("yt-dlp.exe"));
    }

    // Standalone installer / user-placed binary
    if let Some(p) = &local {
        v.push(p.join("Programs").join("yt-dlp").join("yt-dlp.exe"));
    }
    if let Some(p) = &appdata { v.push(p.join("yt-dlp").join("yt-dlp.exe")); }
    if let Some(p) = &home {
        v.push(p.join("yt-dlp").join("yt-dlp.exe"));
        v.push(p.join("bin").join("yt-dlp.exe"));
        // Scoop
        v.push(p.join("scoop").join("apps").join("yt-dlp").join("current").join("yt-dlp.exe"));
        v.push(p.join("scoop").join("shims").join("yt-dlp.exe"));
    }

    // pip / pipx user-install: Python 3.8–3.14
    const PY_VERS: &[&str] = &["314","313","312","311","310","39","38"];
    if let Some(p) = &local {
        for ver in PY_VERS {
            v.push(p.join("Programs").join("Python")
                .join(format!("Python{ver}")).join("Scripts").join("yt-dlp.exe"));
        }
        // pipx venv
        v.push(p.join("pipx").join("venvs").join("yt-dlp").join("Scripts").join("yt-dlp.exe"));
    }
    if let Some(p) = &appdata {
        for ver in PY_VERS {
            v.push(p.join("Python").join(format!("Python{ver}")).join("Scripts").join("yt-dlp.exe"));
        }
        v.push(p.join("Python").join("Scripts").join("yt-dlp.exe"));
    }

    // System-wide Python
    for ver in PY_VERS {
        v.push(PathBuf::from(format!("C:\\Python{ver}\\Scripts\\yt-dlp.exe")));
        v.push(PathBuf::from(format!("C:\\Python\\Python{ver}\\Scripts\\yt-dlp.exe")));
    }

    // Chocolatey
    v.push(PathBuf::from("C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe"));
    v.push(PathBuf::from("C:\\yt-dlp\\yt-dlp.exe"));

    v
}

#[cfg(windows)]
fn ffmpeg_windows_candidates() -> Vec<PathBuf> {
    let local   = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from);
    let home    = std::env::var("USERPROFILE").ok().map(PathBuf::from);

    let mut v = Vec::new();

    // winget
    if let Some(p) = &local {
        v.push(p.join("Microsoft").join("WinGet").join("Links").join("ffmpeg.exe"));
    }

    // Standalone / manual installs
    if let Some(p) = &local {
        v.push(p.join("Programs").join("ffmpeg").join("bin").join("ffmpeg.exe"));
    }

    // Scoop
    if let Some(p) = &home {
        v.push(p.join("scoop").join("apps").join("ffmpeg").join("current").join("bin").join("ffmpeg.exe"));
        v.push(p.join("scoop").join("shims").join("ffmpeg.exe"));
    }

    // Chocolatey
    v.push(PathBuf::from("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe"));

    // System-level manual installs
    v.push(PathBuf::from("C:\\ffmpeg\\bin\\ffmpeg.exe"));
    v.push(PathBuf::from("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"));
    v.push(PathBuf::from("C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe"));

    v
}
