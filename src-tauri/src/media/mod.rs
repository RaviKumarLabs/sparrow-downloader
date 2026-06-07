use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::error::{AppError, Result};
use crate::process_ext::NoWindowExt;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/// Resolves the ffmpeg executable path using a two-step fallback:
///
/// 1. If `configured` is `Some` and points to an existing file, use it.
/// 2. Auto-detect via `settings::detect_ffmpeg_path()` (checks PATH, then
///    common Windows installation directories).
///
/// Returns `None` when ffmpeg cannot be located by any method.
pub fn resolve_ffmpeg_path(configured: Option<&Path>) -> Option<PathBuf> {
    if let Some(path) = configured {
        if path.is_file() {
            return Some(path.to_path_buf());
        }
    }
    crate::settings::detect_ffmpeg_path()
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Runs `ffmpeg -version`, confirms exit 0, and returns the version string
/// (e.g. `"6.0"`, `"n4.4.1-full_build-www.gyan.dev"`).
///
/// # Errors
/// - `AppError::NotFound` — `path` is absolute but does not exist on disk.
/// - `AppError::Io`       — process could not be spawned (bare-name PATH miss,
///                          permission denied, etc.).
/// - `AppError::Process`  — ffmpeg exited non-zero.
/// - `AppError::Process`  — version string could not be parsed from stdout.
pub async fn validate_ffmpeg(path: &Path) -> Result<String> {
    // Guard only for absolute paths; bare names like "ffmpeg.exe" are resolved
    // by the OS at spawn time, so is_file() would incorrectly return false.
    if path.is_absolute() && !path.is_file() {
        return Err(AppError::NotFound(format!(
            "ffmpeg not found at: {}",
            path.display()
        )));
    }

    let output = tokio::process::Command::new(path)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .no_window()
        .output()
        .await?;

    if !output.status.success() {
        return Err(AppError::Process(format!(
            "ffmpeg exited with {} during validation",
            output.status
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_version_string(&stdout).ok_or_else(|| {
        AppError::Process(
            "could not parse ffmpeg version from output".to_owned(),
        )
    })
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Extracts the version token from the first line of `ffmpeg -version` output.
///
/// First line format:
/// ```text
/// ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers
/// ```
fn parse_version_string(output: &str) -> Option<String> {
    let first_line = output.lines().next()?;
    let after_prefix = first_line.strip_prefix("ffmpeg version ")?;
    let version = after_prefix.split_whitespace().next()?;
    Some(version.to_owned())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_version_line() {
        let output = "ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers\nbuilt with gcc\n";
        assert_eq!(parse_version_string(output).as_deref(), Some("6.0"));
    }

    #[test]
    fn parses_gyan_dev_build() {
        let output = "ffmpeg version n4.4.1-full_build-www.gyan.dev ...\n";
        assert_eq!(
            parse_version_string(output).as_deref(),
            Some("n4.4.1-full_build-www.gyan.dev")
        );
    }

    #[test]
    fn parses_git_snapshot_version() {
        let output = "ffmpeg version N-104573-g6d7a21b ...\n";
        assert_eq!(
            parse_version_string(output).as_deref(),
            Some("N-104573-g6d7a21b")
        );
    }

    #[test]
    fn returns_none_for_unrecognised_output() {
        assert!(parse_version_string("").is_none());
        assert!(parse_version_string("not ffmpeg output\n").is_none());
    }
}
