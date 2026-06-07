use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Public type
// ---------------------------------------------------------------------------

/// One parsed progress report from a yt-dlp `[download]` progress line.
/// Emitted to the frontend as the payload of `download:progress` events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    /// Completion percentage in the range 0.0 – 100.0.
    pub percent: f64,

    /// Total file size in bytes. `None` if yt-dlp did not report file size.
    /// May be approximate when yt-dlp prefixed the size with `~`.
    pub total_bytes: Option<u64>,

    /// Bytes received so far, derived as `(percent / 100) × total_bytes`.
    /// `None` when `total_bytes` is unavailable.
    pub downloaded_bytes: Option<u64>,

    /// Current transfer rate in bytes per second.
    /// `None` when yt-dlp reports "Unknown speed".
    pub speed_bps: Option<f64>,

    /// Estimated seconds remaining.
    /// `None` when yt-dlp reports "Unknown" ETA.
    pub eta_seconds: Option<u64>,
}

// ---------------------------------------------------------------------------
// Compiled regex (initialised once per process)
// ---------------------------------------------------------------------------

// Matches the standard yt-dlp progress line:
//
//   [download]  50.0% of    12.34MiB at    1.23MiB/s ETA 00:05
//   [download]  50.0% of ~  12.34MiB at    1.23MiB/s ETA 00:05
//   [download]  50.0% of    12.34MiB at Unknown speed ETA Unknown
//   [download]  50.0% of    12.34MiB at    1.23MiB/s ETA 01:00:00
//   [download]  50.0% of    12.34MiB at    1.23MiB/s ETA 00:05 (frag 5/10)
//
// Group map:
//   1  percent value          (always present when regex matches)
//   2  filesize value         (always present)
//   3  filesize unit          (always present)
//   4  speed value            (None when "Unknown speed")
//   5  speed unit             (None when "Unknown speed")
//   6  ETA string             (always present; may be "Unknown")
fn progress_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"^\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)\s*(B|KiB|MiB|GiB|TiB)\s+at\s+(?:([\d.]+)\s*(B|KiB|MiB|GiB|TiB)/s|Unknown\s+speed)\s+ETA\s+(\S+)",
        )
        .expect("progress regex is valid")
    })
}

// ---------------------------------------------------------------------------
// Public entry point — pure parsing, no I/O
// ---------------------------------------------------------------------------

/// Parses a single line from yt-dlp's stdout.
///
/// Returns `Some(ProgressUpdate)` only for `[download]  X% of …` progress
/// lines.  All other lines (destinations, merge notices, info messages)
/// return `None` without error.
pub fn parse_progress_line(line: &str) -> Option<ProgressUpdate> {
    let caps = progress_re().captures(line.trim())?;

    let percent: f64 = caps[1].parse().ok()?;

    let size_val: f64  = caps[2].parse().ok()?;
    let size_unit      = &caps[3];
    let total_bytes    = Some(to_bytes(size_val, size_unit));

    // Groups 4 & 5 are only filled when the speed alternation matched a number.
    let speed_bps = caps.get(4).zip(caps.get(5)).and_then(|(val, unit)| {
        let v: f64 = val.as_str().parse().ok()?;
        Some(to_bytes_f64(v, unit.as_str()))
    });

    let eta_str    = caps.get(6).map_or("", |m| m.as_str());
    let eta_seconds = parse_eta(eta_str.trim());

    let downloaded_bytes = total_bytes.map(|t| ((percent / 100.0) * t as f64) as u64);

    Some(ProgressUpdate {
        percent,
        total_bytes,
        downloaded_bytes,
        speed_bps,
        eta_seconds,
    })
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Converts a value + yt-dlp binary unit string to a whole number of bytes.
fn to_bytes(value: f64, unit: &str) -> u64 {
    (value * unit_multiplier(unit)) as u64
}

/// Same conversion but keeps the result as f64 (used for speed in bytes/sec).
fn to_bytes_f64(value: f64, unit: &str) -> f64 {
    value * unit_multiplier(unit)
}

fn unit_multiplier(unit: &str) -> f64 {
    match unit {
        "B"   =>                    1.0,
        "KiB" =>                1_024.0,
        "MiB" =>            1_048_576.0,
        "GiB" =>        1_073_741_824.0,
        "TiB" => 1_099_511_627_776.0,
        _     =>                    1.0,
    }
}

/// Parses yt-dlp ETA strings of the form `MM:SS` or `HH:MM:SS`.
/// Returns `None` for `"Unknown"` (case-insensitive) and malformed input.
fn parse_eta(s: &str) -> Option<u64> {
    if s.eq_ignore_ascii_case("unknown") {
        return None;
    }
    // Iterate parts right-to-left: seconds at index 0, minutes at 1, hours at 2.
    // Each position multiplies by 60^index.
    let mut total: u64 = 0;
    for (i, part) in s.split(':').rev().enumerate() {
        let n: u64 = part.parse().ok()?;
        total += n * 60u64.pow(i as u32);
    }
    Some(total)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_line() {
        let line = "[download]  50.0% of    12.34MiB at    1.23MiB/s ETA 00:05";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 50.0).abs() < 0.001);
        assert_eq!(p.total_bytes, Some(12_941_721)); // 12.34 × 1_048_576
        assert_eq!(p.eta_seconds, Some(5));
        assert!(p.speed_bps.is_some());
    }

    #[test]
    fn parses_approximate_size() {
        let line = "[download]  25.0% of ~  100.00MiB at    5.00MiB/s ETA 01:15";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 25.0).abs() < 0.001);
        assert_eq!(p.eta_seconds, Some(75));
    }

    #[test]
    fn parses_unknown_speed_and_eta() {
        let line = "[download]  75.0% of    12.34MiB at Unknown speed ETA Unknown";
        let p = parse_progress_line(line).unwrap();
        assert!((p.percent - 75.0).abs() < 0.001);
        assert!(p.speed_bps.is_none());
        assert!(p.eta_seconds.is_none());
    }

    #[test]
    fn parses_hms_eta() {
        let line = "[download]  10.0% of     1.00GiB at    1.00MiB/s ETA 01:42:00";
        let p = parse_progress_line(line).unwrap();
        assert_eq!(p.eta_seconds, Some(6120));
    }

    #[test]
    fn ignores_fragment_suffix() {
        let line = "[download]  50.0% of    12.34MiB at    1.23MiB/s ETA 00:05 (frag 5/10)";
        let p = parse_progress_line(line).unwrap();
        assert_eq!(p.eta_seconds, Some(5));
    }

    #[test]
    fn returns_none_for_destination_line() {
        let line = "[download] Destination: /tmp/video.mp4";
        assert!(parse_progress_line(line).is_none());
    }

    #[test]
    fn returns_none_for_already_downloaded() {
        let line = "[download] 100% of 12.34MiB in 00:05";
        assert!(parse_progress_line(line).is_none());
    }

    #[test]
    fn returns_none_for_merger_line() {
        let line = r#"[Merger] Merging formats into "output.mp4""#;
        assert!(parse_progress_line(line).is_none());
    }

    #[test]
    fn derived_downloaded_bytes() {
        let line = "[download]  50.0% of     2.00MiB at    1.00MiB/s ETA 00:02";
        let p = parse_progress_line(line).unwrap();
        let total = p.total_bytes.unwrap();
        let dl    = p.downloaded_bytes.unwrap();
        // 50 % of 2 MiB = 1 MiB
        assert_eq!(dl, total / 2);
    }
}
