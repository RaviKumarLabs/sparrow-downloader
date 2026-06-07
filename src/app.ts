import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// ─────────────────────────────────────────────────────────────
// SVG icon constants
// ─────────────────────────────────────────────────────────────

const I_HOME = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
const I_DL = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const I_HIST = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const I_SET = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const I_PLAY = `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
const I_DL_SM = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
const I_LINK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const I_FETCH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const I_WARN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const I_TRASH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const I_CANCEL = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const I_OPEN_FILE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const I_FOLDER = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const I_SPEED = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
const I_CLOCK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const I_EYE = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const I_CAL = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const I_VFY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
const I_RFRSH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
const I_EMPTY = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const I_QUEUE = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
const I_UP       = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const I_DOWN     = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const I_PLAYLIST = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>`;
const I_CHANNEL  = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none"/></svg>`;
const I_BATCH    = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><line x1="5" y1="12" x2="5" y2="18"/><line x1="19" y1="12" x2="19" y2="18"/></svg>`;
const I_CHECK    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const I_VIDEO    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`;
const I_PAUSE    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const I_RESUME   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const I_TOP      = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 11 12 5 6 11"/><line x1="12" y1="5" x2="12" y2="19"/></svg>`;
const I_BOTTOM   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 13 12 19 18 13"/><line x1="12" y1="5" x2="12" y2="19"/></svg>`;
const I_REDOWN   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`;
const I_SEARCH   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const I_STAR     = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const I_INFO     = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
const I_BIRD     = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4c0 0-4 1-6 3-1.5 1.5-2 3-2 3s-2-1-4-1c-3 0-6 2.5-6 6s3 5 5 5c1.5 0 3-1 3-1s1 2 3 2c2.5 0 4-2 4-2s1 1 3 1"/><path d="M2 12s2-1 4 0"/></svg>`;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
type View = "home" | "history" | "settings" | "queue" | "playlist" | "channel" | "batch" | "about" | "premium";
type UpdaterPhase = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

interface SystemInfo {
  app_version: string;
  os_name: string;
  os_arch: string;
  ytdlp_version: string | null;
  ffmpeg_version: string | null;
}

interface QueueItem {
  download_id: string;
  position: number;
  title: string | null;
  url: string;
  status: string;
  format: string | null;
  quality: string | null;
  progress: number;
}

interface FormatInfo {
  format_id: string;
  ext: string;
  quality: number | null;
  format_note: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  filesize_approx: number | null;
  tbr: number | null;
  abr: number | null;
  vbr: number | null;
  has_video: boolean;
  has_audio: boolean;
}

interface VideoMetadata {
  id: string;
  title: string;
  duration: number | null;
  uploader: string | null;
  thumbnail: string | null;
  webpage_url: string;
  formats: FormatInfo[];
  view_count?: number | null;
  upload_date?: string | null;
}

interface ProgressUpdate {
  percent: number;
  total_bytes: number | null;
  downloaded_bytes: number | null;
  speed_bps: number | null;
  eta_seconds: number | null;
}

interface StartedPayload {
  download_id: string;
  title: string | null;
  url: string;
}
interface ProgressPayload {
  download_id: string;
  progress: ProgressUpdate;
}
interface CompletedPayload {
  download_id: string;
  output_path: string | null;
}
interface FailedPayload {
  download_id: string;
  error: string;
}
interface CancelledPayload {
  download_id: string;
}
interface PausedPayload {
  download_id: string;
}

interface AppStatistics {
  total_downloads: number;
  completed_count: number;
  failed_count: number;
  paused_count: number;
  total_bytes: number;
  today_bytes: number;
  today_count: number;
}

interface DownloadEntry {
  id: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  status: DownloadStatus;
  percent: number;
  speedBps: number | null;
  etaSeconds: number | null;
  totalBytes: number | null;
  downloadedBytes: number | null;
  error: string | null;
  outputPath: string | null;
}

interface HistoryDownload {
  id: string;
  url: string;
  title: string | null;
  status: string;
  format: string | null;
  quality: string | null;
  output_path: string | null;
  file_size: number | null;
  downloaded_bytes: number;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface PlaylistEntry {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  url: string;
  uploader: string | null;
  playlist_index: number | null;
}

interface PlaylistMetadata {
  id: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  webpage_url: string;
  entry_count: number;
  total_duration: number | null;
  entries: PlaylistEntry[];
}

interface BatchValidationResult {
  valid_urls: string[];
  invalid_urls: string[];
  duplicate_urls: string[];
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
}

type CookieSource = "disabled" | "chrome" | "edge" | "firefox" | "brave";

interface AppSettings {
  ytdlp_path: string | null;
  ffmpeg_path: string | null;
  output_directory: string;
  max_concurrent_downloads: number;
  default_format: string;
  default_quality: string;
  cookie_source: CookieSource;
  notifications_enabled: boolean;
}

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

const state = {
  metadata: null as VideoMetadata | null,
  currentUrl: "",
  currentView: "home" as View,
  downloads: new Map<string, DownloadEntry>(),
  unlisteners: [] as UnlistenFn[],
  stats: { today: 0, total: 0, totalSize: 0, completed: 0, failed: 0 },
  liveStatsTimer: null as number | null,
  notificationsEnabled: true,
  // History view
  historyItems: [] as HistoryDownload[],
  historyFilter: "all" as "all" | "completed" | "failed" | "cancelled",
  historySearch: "",
  historySort: "date-desc" as "date-desc" | "date-asc" | "name" | "size",
  // Playlist view
  playlistMeta: null as PlaylistMetadata | null,
  playlistSelectedIds: new Set<string>(),
  // Channel view
  channelMeta: null as PlaylistMetadata | null,
  channelSelectedIds: new Set<string>(),
  // Batch view
  batchValidation: null as BatchValidationResult | null,
  // Updater
  updaterPhase: "idle" as UpdaterPhase,
  pendingUpdate: null as Update | null,
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function cmd<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

function q<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024) return `${(b / 1_024).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtSpeed(bps: number): string {
  if (bps >= 1_073_741_824) return `${(bps / 1_073_741_824).toFixed(1)} GB/s`;
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1_024) return `${(bps / 1_024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    s = Math.floor(secs % 60);
  const mm = String(m).padStart(2, "0"),
    ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function fmtEta(secs: number): string {
  const h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    s = secs % 60;
  const hh = String(h).padStart(2, "0"),
    mm = String(m).padStart(2, "0"),
    ss = String(s).padStart(2, "0");
  return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function sendNotification(title: string, body: string, tag?: string): void {
  if (!state.notificationsEnabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag });
  } catch { /* non-critical */ }
}

function setStatus(
  msg: string,
  kind: "default" | "ok" | "error" | "active" = "default",
): void {
  const el = q<HTMLElement>("status-text");
  const dot = q<HTMLElement>("status-dot");
  if (!el || !dot) return;
  el.textContent = msg;
  el.className = kind === "default" ? "" : kind;
  dot.className = `status-dot ${kind === "default" ? "" : kind}`;
}

// ─────────────────────────────────────────────────────────────
// Layout builder
// ─────────────────────────────────────────────────────────────

function buildLayout(root: HTMLElement): void {
  root.innerHTML = `
<div class="app-shell">

  <!-- ═══ SIDEBAR ═══ -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">${I_BIRD}</div>
      <div class="brand-text">
        <div class="brand-name">Sparrow</div>
        <div class="brand-sub">Downloader v1.0.0-beta.1</div>
      </div>
    </div>

    <div class="sidebar-nav-wrap">
      <nav class="sidebar-nav">
        <button class="nav-item is-active" data-view="home">${I_HOME}<span>Home</span></button>
        <button class="nav-item" data-view="home" id="nav-downloads">
          ${I_DL}<span>Downloads</span>
          <span class="nav-badge" id="nav-dl-badge" hidden>0</span>
        </button>
        <button class="nav-item" data-view="queue">
          ${I_QUEUE}<span>Queue</span>
          <span class="nav-badge" id="nav-queue-badge" hidden>0</span>
        </button>
        <button class="nav-item" data-view="history">${I_HIST}<span>History</span></button>
        <div class="nav-section-label">Bulk Downloads</div>
        <button class="nav-item" data-view="playlist">${I_PLAYLIST}<span>Playlist</span></button>
        <button class="nav-item" data-view="channel">${I_CHANNEL}<span>Channel</span></button>
        <button class="nav-item" data-view="batch">${I_BATCH}<span>Batch Import</span></button>
        <button class="nav-item" data-view="settings">${I_SET}<span>Settings</span></button>
        <div class="nav-section-label">Account</div>
        <button class="nav-item nav-item-premium" data-view="premium">${I_STAR}<span>Upgrade To Premium</span></button>
        <button class="nav-item" data-view="about">${I_INFO}<span>About</span></button>
      </nav>
    </div>

    <div class="sidebar-stats">
      <div class="stats-header">Quick Stats</div>
      <div class="stats-graph">
        <svg viewBox="0 0 200 38" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#6C63FF" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="#6C63FF" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path id="stats-area" fill="url(#sg)" d=""/>
          <path id="stats-line" fill="none" stroke="#6C63FF" stroke-width="2" stroke-linejoin="round" d=""/>
        </svg>
      </div>
      <div class="stats-rows">
        <div class="stat-row">
          <div class="stat-label">Today downloaded</div>
          <div class="stat-value" id="stat-today">—</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">Total size</div>
          <div class="stat-value" id="stat-size">—</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">Completed</div>
          <div class="stat-value" id="stat-completed" style="color:var(--success)">—</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">Failed</div>
          <div class="stat-value" id="stat-failed" style="color:var(--danger)">—</div>
        </div>
      </div>
    </div>

    <div class="sidebar-cta" id="sidebar-cta-premium" role="button" tabindex="0">
      <div class="cta-crown">⭐</div>
      <div class="cta-body">
        <div class="cta-title">Upgrade To Premium</div>
        <div class="cta-sub">Unlock all features</div>
      </div>
      <div class="cta-chevron">›</div>
    </div>
  </aside>

  <!-- ═══ MAIN PANEL ═══ -->
  <div class="main-panel">
    <!-- Detail panel overlay -->
    <div id="detail-panel" class="detail-panel" hidden>
      <div class="detail-backdrop" id="detail-backdrop"></div>
      <div class="detail-drawer">
        <div class="detail-header">
          <span class="detail-title">Download Details</span>
          <button id="detail-close" class="dl-btn" type="button">✕</button>
        </div>
        <div id="detail-content" class="detail-content"></div>
      </div>
    </div>

    <div class="main-scroll">
      <div class="content-inner">

        <!-- Paused sessions banner -->
        <div id="paused-banner" class="paused-banner" hidden>
          <span class="paused-banner-icon">${I_PAUSE}</span>
          <span id="paused-banner-text">downloads paused from last session.</span>
          <button id="resume-all-btn" class="paused-banner-btn" type="button">Resume All</button>
          <button id="dismiss-banner-btn" class="paused-banner-dismiss" type="button">✕</button>
        </div>

        <!-- Update available banner -->
        <div id="update-banner" class="update-banner" hidden>
          <span class="update-banner-icon">🆕</span>
          <span id="update-banner-text">Update available</span>
          <button id="update-banner-view-btn" class="paused-banner-btn" type="button">View Details</button>
          <button id="update-banner-dismiss-btn" class="paused-banner-dismiss" type="button">✕</button>
        </div>

        <!-- ── HOME VIEW ── -->
        <div class="view is-active" id="view-home">

          <!-- Hero -->
          <div class="hero-card">
            <div class="hero-body">
              <div class="hero-text">
                <h1 class="hero-headline">
                  Download videos from<br>
                  <span class="hero-accent">YouTube</span> in high quality
                </h1>
                <div class="hero-tagline">
                  Fast <span class="hero-dot"></span>
                  High Quality <span class="hero-dot"></span>
                  Easy to Use
                </div>
                <div class="hero-row">
                  <div class="hero-input-wrap">
                    <span class="hero-input-icon">${I_LINK}</span>
                    <input id="url-input" class="hero-input" type="url"
                      placeholder="Paste YouTube URL here…"
                      autocomplete="off" spellcheck="false"/>
                  </div>
                  <button id="fetch-btn" class="btn-fetch">
                    ${I_FETCH}<span>Fetch Info</span>
                  </button>
                </div>
              </div>
              <div class="hero-deco" aria-hidden="true">
                <div class="hero-deco-play">${I_PLAY}</div>
                <div class="hero-deco-dl">${I_DL_SM}</div>
              </div>
            </div>
          </div>

          <!-- yt-dlp setup alert -->
          <div id="ytdlp-setup" class="setup-alert" hidden>
            <div class="setup-alert-icon">${I_WARN}</div>
            <div class="setup-alert-body">
              <div class="setup-alert-title">yt-dlp not found</div>
              <p class="setup-alert-desc">
                yt-dlp is required to download videos.
                Enter the full path to <code>yt-dlp.exe</code> below and click Save.
              </p>
              <div class="setup-alert-row">
                <input id="ytdlp-path-input" class="settings-input mono" type="text"
                  placeholder="C:\\tools\\yt-dlp.exe" spellcheck="false" style="flex:1;min-width:0;"/>
                <button id="ytdlp-save-btn" class="btn-s-save" type="button">Save</button>
              </div>
            </div>
          </div>

          <!-- Metadata + config -->
          <div id="metadata-panel" hidden>
            <div class="meta-card">
              <div class="meta-thumb-wrap">
                <img id="thumbnail-img" class="meta-thumb" alt="" hidden/>
                <span class="meta-thumb-duration" id="meta-duration" hidden></span>
              </div>
              <div class="meta-info">
                <h2 id="video-title" class="meta-title"></h2>
                <div id="video-uploader" class="meta-uploader"></div>
                <div id="video-meta" class="meta-badges"></div>
              </div>
            </div>

            <div class="config-card">
              <div class="config-row">
                <div class="field-group">
                  <label class="field-label" for="format-select">Format</label>
                  <select id="format-select" class="select-field">
                    <option value="mp4">MP4 (Video)</option>
                    <option value="webm">WebM (Video)</option>
                    <option value="mp3">MP3 (Audio)</option>
                    <option value="m4a">M4A (Audio)</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="quality-select">Quality</label>
                  <select id="quality-select" class="select-field">
                    <option value="best">Best available</option>
                    <option value="2160p">4K — 2160p</option>
                    <option value="1440p">1440p</option>
                    <option value="1080p" selected>1080p (Full HD)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                  </select>
                </div>
                <div class="field-group" style="margin-left:auto;">
                  <label class="field-label">&nbsp;</label>
                  <button id="download-btn" class="btn-download">
                    ${I_DL_SM}<span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Active downloads -->
          <div class="section-hdr">
            <div>
              <span class="section-title">Active Downloads</span>
              <span class="section-count" id="active-count-label"></span>
            </div>
            <button id="clear-completed" class="btn-clear" type="button">Clear Completed</button>
          </div>
          <div id="downloads-list" class="downloads-list"></div>
          <div id="downloads-empty" class="empty-state">
            <div class="empty-icon">${I_EMPTY}</div>
            <p class="empty-title">No active downloads</p>
            <p class="empty-sub">Paste a YouTube URL above to get started</p>
          </div>

        </div><!-- /view-home -->

        <!-- ── QUEUE VIEW ── -->
        <div class="view" id="view-queue">
          <div class="view-hdr">
            <h2 class="view-title">Download Queue</h2>
            <div class="queue-worker-badge" id="queue-worker-badge">
              <span id="queue-worker-text">0 active</span>
            </div>
            <button id="queue-refresh" class="btn btn-icon" type="button" title="Refresh">${I_RFRSH}</button>
          </div>

          <div class="section-hdr" id="queue-active-hdr" hidden>
            <span class="section-title">Downloading</span>
            <span class="section-count" id="queue-active-label"></span>
          </div>
          <div id="queue-active-list"></div>

          <div class="section-hdr" id="queue-pending-hdr" hidden>
            <span class="section-title">Pending</span>
            <span class="section-count" id="queue-pending-label"></span>
          </div>
          <div id="queue-pending-list"></div>

          <div id="queue-empty" class="empty-state" hidden>
            <div class="empty-icon">${I_QUEUE}</div>
            <p class="empty-title">Queue is empty</p>
            <p class="empty-sub">Downloads will appear here once started</p>
          </div>
        </div><!-- /view-queue -->

        <!-- ── HISTORY VIEW ── -->
        <div class="view" id="view-history">
          <div class="view-hdr">
            <h2 class="view-title">Download History</h2>
            <button id="history-refresh" class="btn btn-icon" type="button" title="Refresh">${I_RFRSH}</button>
          </div>
          <div class="history-toolbar">
            <div class="hist-search-wrap">
              ${I_SEARCH}
              <input id="hist-search" class="hist-search-input" type="search"
                placeholder="Search history…" autocomplete="off" />
            </div>
            <div class="hist-filter-chips">
              <button class="hist-chip is-active" data-filter="all">All</button>
              <button class="hist-chip" data-filter="completed">Completed</button>
              <button class="hist-chip" data-filter="failed">Failed</button>
              <button class="hist-chip" data-filter="cancelled">Cancelled</button>
            </div>
            <select id="hist-sort" class="hist-sort-select">
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="size">Largest first</option>
            </select>
          </div>
          <div id="history-list" class="history-list"></div>
          <div id="history-empty" class="empty-state" hidden>
            <div class="empty-icon">${I_HIST}</div>
            <p class="empty-title">No download history yet</p>
            <p class="empty-sub">Completed downloads will appear here</p>
          </div>
        </div>

        <!-- ── SETTINGS VIEW ── -->
        <div class="view" id="view-settings">
          <div class="view-hdr">
            <h2 class="view-title">Settings</h2>
          </div>
          <div id="settings-content" class="settings-sections"></div>
        </div>

        <!-- ── PLAYLIST VIEW ── -->
        <div class="view" id="view-playlist">
          <div class="view-hdr">
            <h2 class="view-title">Playlist Downloader</h2>
          </div>

          <div class="bulk-input-card">
            <div class="bulk-url-row">
              <span class="hero-input-icon">${I_LINK}</span>
              <input id="pl-url-input" class="hero-input" type="url"
                placeholder="Paste YouTube playlist URL…"
                autocomplete="off" spellcheck="false"/>
              <button id="pl-fetch-btn" class="btn-fetch">
                ${I_FETCH}<span>Fetch Playlist</span>
              </button>
            </div>
          </div>

          <div id="pl-panel" hidden>
            <div class="pl-meta-card">
              <img id="pl-thumb" class="pl-thumb" alt="" hidden/>
              <div class="pl-meta-body">
                <div id="pl-title" class="pl-meta-title"></div>
                <div id="pl-uploader" class="pl-meta-uploader"></div>
                <div id="pl-stats" class="pl-meta-stats"></div>
              </div>
            </div>

            <div class="config-card">
              <div class="config-row">
                <div class="field-group">
                  <label class="field-label">Format</label>
                  <select id="pl-format" class="select-field">
                    <option value="mp4">MP4 (Video)</option>
                    <option value="webm">WebM (Video)</option>
                    <option value="mp3">MP3 (Audio)</option>
                    <option value="m4a">M4A (Audio)</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">Quality</label>
                  <select id="pl-quality" class="select-field">
                    <option value="best">Best available</option>
                    <option value="1080p" selected>1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                </div>
                <div class="pl-bulk-actions" style="margin-left:auto;display:flex;gap:8px;align-items:flex-end;">
                  <button id="pl-select-all" class="btn btn-sm" type="button">Select All</button>
                  <button id="pl-deselect-all" class="btn btn-sm" type="button">Deselect All</button>
                  <button id="pl-download-btn" class="btn-download" type="button">
                    ${I_DL_SM}<span id="pl-download-label">Download Selected</span>
                  </button>
                </div>
              </div>
            </div>

            <div id="pl-video-list" class="bulk-video-list"></div>
          </div>

          <div id="pl-empty" class="empty-state" hidden>
            <div class="empty-icon">${I_PLAYLIST}</div>
            <p class="empty-title">No playlist loaded</p>
            <p class="empty-sub">Paste a YouTube playlist URL above and click Fetch Playlist</p>
          </div>
        </div><!-- /view-playlist -->

        <!-- ── CHANNEL VIEW ── -->
        <div class="view" id="view-channel">
          <div class="view-hdr">
            <h2 class="view-title">Channel Downloader</h2>
          </div>

          <div class="bulk-input-card">
            <div class="bulk-url-row">
              <span class="hero-input-icon">${I_LINK}</span>
              <input id="ch-url-input" class="hero-input" type="url"
                placeholder="Paste YouTube channel URL…"
                autocomplete="off" spellcheck="false"/>
              <select id="ch-limit-select" class="select-field" style="flex-shrink:0;width:160px;">
                <option value="10">Latest 10 videos</option>
                <option value="25" selected>Latest 25 videos</option>
                <option value="50">Latest 50 videos</option>
                <option value="">All available</option>
              </select>
              <button id="ch-fetch-btn" class="btn-fetch">
                ${I_FETCH}<span>Fetch Channel</span>
              </button>
            </div>
          </div>

          <div id="ch-panel" hidden>
            <div class="pl-meta-card">
              <img id="ch-thumb" class="pl-thumb" alt="" hidden/>
              <div class="pl-meta-body">
                <div id="ch-name" class="pl-meta-title"></div>
                <div id="ch-stats" class="pl-meta-stats"></div>
              </div>
            </div>

            <div class="config-card">
              <div class="config-row">
                <div class="field-group">
                  <label class="field-label">Format</label>
                  <select id="ch-format" class="select-field">
                    <option value="mp4">MP4 (Video)</option>
                    <option value="webm">WebM (Video)</option>
                    <option value="mp3">MP3 (Audio)</option>
                    <option value="m4a">M4A (Audio)</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label">Quality</label>
                  <select id="ch-quality" class="select-field">
                    <option value="best">Best available</option>
                    <option value="1080p" selected>1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                </div>
                <div class="pl-bulk-actions" style="margin-left:auto;display:flex;gap:8px;align-items:flex-end;">
                  <button id="ch-select-all" class="btn btn-sm" type="button">Select All</button>
                  <button id="ch-deselect-all" class="btn btn-sm" type="button">Deselect All</button>
                  <button id="ch-download-btn" class="btn-download" type="button">
                    ${I_DL_SM}<span id="ch-download-label">Download Selected</span>
                  </button>
                </div>
              </div>
            </div>

            <div id="ch-video-list" class="bulk-video-list"></div>
          </div>

          <div id="ch-empty" class="empty-state" hidden>
            <div class="empty-icon">${I_CHANNEL}</div>
            <p class="empty-title">No channel loaded</p>
            <p class="empty-sub">Paste a YouTube channel URL above and click Fetch Channel</p>
          </div>
        </div><!-- /view-channel -->

        <!-- ── BATCH IMPORT VIEW ── -->
        <div class="view" id="view-batch">
          <div class="view-hdr">
            <h2 class="view-title">Batch Import</h2>
          </div>

          <div class="bulk-input-card">
            <div class="field-label" style="margin-bottom:8px;">
              Paste one URL per line — video URLs, playlist URLs, or mixed
            </div>
            <textarea id="batch-textarea" class="batch-textarea"
              placeholder="https://www.youtube.com/watch?v=...&#10;https://youtu.be/...&#10;https://www.youtube.com/playlist?list=..."></textarea>
            <div class="batch-actions-row">
              <div class="field-group" style="flex-shrink:0;">
                <label class="field-label">Format</label>
                <select id="batch-format" class="select-field">
                  <option value="mp4">MP4 (Video)</option>
                  <option value="webm">WebM (Video)</option>
                  <option value="mp3">MP3 (Audio)</option>
                  <option value="m4a">M4A (Audio)</option>
                </select>
              </div>
              <div class="field-group" style="flex-shrink:0;">
                <label class="field-label">Quality</label>
                <select id="batch-quality" class="select-field">
                  <option value="best">Best available</option>
                  <option value="1080p" selected>1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
              </div>
              <div style="margin-left:auto;display:flex;gap:8px;align-items:flex-end;">
                <button id="batch-validate-btn" class="btn btn-sm" type="button">
                  ${I_CHECK} Validate
                </button>
                <button id="batch-import-btn" class="btn-download" type="button">
                  ${I_DL_SM}<span>Import to Queue</span>
                </button>
              </div>
            </div>
          </div>

          <div id="batch-summary" class="batch-summary" hidden></div>
        </div><!-- /view-batch -->


        <!-- ─── ABOUT ─── -->
        <div class="view" id="view-about">
          <div class="view-header">
            <h2 class="view-title">About Sparrow Downloader</h2>
          </div>
          <div class="about-layout">
            <div class="about-hero-card">
              <div class="about-hero-bird">${I_BIRD}</div>
              <div class="about-hero-text">
                <h1 class="about-product-name">Sparrow Downloader</h1>
                <div class="about-version-badge">v1.0.0-beta.1</div>
                <p class="about-tagline">Professional YouTube downloader for the desktop</p>
              </div>
              <div class="about-updater-ctrl">
                <div class="about-ver-row">
                  <div class="about-ver-item">
                    <span class="about-ver-label">Current</span>
                    <code class="about-ver-val" id="about-ver-current">—</code>
                  </div>
                  <span class="about-ver-arrow">→</span>
                  <div class="about-ver-item">
                    <span class="about-ver-label">Latest</span>
                    <code class="about-ver-val" id="about-ver-latest">—</code>
                  </div>
                </div>
                <button class="btn btn-sm about-check-btn" id="about-check-update-btn" type="button">
                  ${I_RFRSH}&ensp;Check for Updates
                </button>
                <p class="about-update-status" id="about-update-status"></p>
              </div>
            </div>
            <div class="about-grid">
              <div class="about-card">
                <div class="about-card-header">System Information</div>
                <div class="about-info-rows" id="about-system-rows">
                  <div class="about-info-row"><span class="about-info-key">Loading…</span></div>
                </div>
              </div>
              <div class="about-card">
                <div class="about-card-header">Tech Stack</div>
                <div class="about-tech-list">
                  <div class="about-tech-item"><span class="about-tech-dot t-rust"></span><span>Rust + Tauri v2</span></div>
                  <div class="about-tech-item"><span class="about-tech-dot t-ts"></span><span>TypeScript (Vanilla)</span></div>
                  <div class="about-tech-item"><span class="about-tech-dot t-db"></span><span>SQLite (rusqlite)</span></div>
                  <div class="about-tech-item"><span class="about-tech-dot t-yt"></span><span>yt-dlp (subprocess)</span></div>
                  <div class="about-tech-item"><span class="about-tech-dot t-ff"></span><span>FFmpeg (post-processing)</span></div>
                  <div class="about-tech-item"><span class="about-tech-dot t-tk"></span><span>Tokio async runtime</span></div>
                </div>
              </div>
              <div class="about-card">
                <div class="about-card-header">Developer</div>
                <div class="about-dev-section">
                  <div class="about-dev-avatar">RK</div>
                  <div class="about-dev-info">
                    <div class="about-dev-name">Ravi Kumar</div>
                    <div class="about-dev-role">Lead Developer</div>
                    <div class="about-dev-email">ravikumarcyberworld@gmail.com</div>
                  </div>
                </div>
              </div>
              <div class="about-card">
                <div class="about-card-header">Project Information</div>
                <div class="about-info-rows">
                  <div class="about-info-row"><span class="about-info-key">Product</span><span class="about-info-val">Sparrow Downloader</span></div>
                  <div class="about-info-row"><span class="about-info-key">Version</span><span class="about-info-val">v1.0.0-beta.1</span></div>
                  <div class="about-info-row"><span class="about-info-key">Channel</span><span class="about-info-val">Beta</span></div>
                  <div class="about-info-row"><span class="about-info-key">License</span><span class="about-info-val">Proprietary</span></div>
                </div>
              </div>
            </div>
            <!-- Update panel — shown when update is available or downloading -->
            <div class="about-update-panel" id="about-update-panel" hidden>
              <div class="aup-header">
                <div class="aup-badge">🆕 Update Available</div>
                <div class="aup-version" id="aup-version"></div>
              </div>
              <div class="aup-notes" id="aup-notes"></div>
              <div class="aup-actions">
                <button class="btn btn-primary aup-dl-btn" id="aup-dl-btn" type="button">
                  ${I_DL_SM}&ensp;Download &amp; Install
                </button>
                <button class="btn btn-primary aup-restart-btn" id="aup-restart-btn" type="button" hidden>
                  ↻&ensp;Restart &amp; Install Now
                </button>
              </div>
              <div class="aup-progress" id="aup-progress" hidden>
                <div class="aup-bar-track"><div class="aup-bar-fill" id="aup-bar-fill" style="width:0%"></div></div>
                <div class="aup-bar-label" id="aup-bar-label">Downloading…</div>
              </div>
            </div>

            <div class="about-links-row">
              <span class="about-link-btn">Website (coming soon)</span>
              <span class="about-link-btn">Documentation</span>
              <span class="about-link-btn">Report a Bug</span>
              <button class="about-link-btn about-link-btn-premium" data-view="premium">⭐ Upgrade to Premium</button>
            </div>
            <div class="about-copyright">© 2025 Sparrow Downloader. All rights reserved.</div>
          </div>
        </div><!-- /view-about -->

        <!-- ─── PREMIUM ─── -->
        <div class="view" id="view-premium">
          <div class="premium-wrap">
            <div class="prem-hero">
              <div class="prem-hero-badge">⭐ PREMIUM</div>
              <h1 class="prem-hero-title">Unlock the full Sparrow experience</h1>
              <p class="prem-hero-sub">Faster downloads, concurrent queues, advanced formats, and priority support.</p>
              <div class="prem-google-wrap">
                <button class="prem-google-btn" id="prem-google-btn">
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue With Google
                </button>
                <div class="prem-google-note" id="prem-google-note" hidden>Authentication backend coming soon.</div>
              </div>
            </div>

            <div class="prem-pricing-grid">
              <div class="prem-plan-card">
                <div class="prem-plan-label">Monthly</div>
                <div class="prem-plan-price">$4<span class="prem-plan-period">/mo</span></div>
                <ul class="prem-plan-features">
                  <li>Up to 5 concurrent downloads</li><li>Priority queue processing</li>
                  <li>Advanced format options</li><li>Email support</li>
                </ul>
                <button class="prem-plan-btn prem-plan-coming">Coming Soon</button>
              </div>
              <div class="prem-plan-card prem-plan-featured">
                <div class="prem-plan-crown">⭐ MOST POPULAR</div>
                <div class="prem-plan-label">Quarterly</div>
                <div class="prem-plan-price">$9<span class="prem-plan-period">/3 mo</span></div>
                <div class="prem-plan-saving">Save 25%</div>
                <ul class="prem-plan-features">
                  <li>Everything in Monthly</li><li>10 concurrent downloads</li>
                  <li>Batch import up to 500 URLs</li><li>Channel archive mode</li>
                  <li>Priority support</li>
                </ul>
                <button class="prem-plan-btn prem-plan-btn-featured prem-plan-coming">Coming Soon</button>
              </div>
              <div class="prem-plan-card">
                <div class="prem-plan-label">Yearly</div>
                <div class="prem-plan-price">$29<span class="prem-plan-period">/yr</span></div>
                <div class="prem-plan-saving">Save 40%</div>
                <ul class="prem-plan-features">
                  <li>Everything in Quarterly</li><li>Unlimited concurrent downloads</li>
                  <li>Custom download profiles</li><li>Advanced scheduler</li>
                </ul>
                <button class="prem-plan-btn prem-plan-coming">Coming Soon</button>
              </div>
              <div class="prem-plan-card prem-plan-lifetime">
                <div class="prem-plan-crown">🔥 BEST VALUE</div>
                <div class="prem-plan-label">Lifetime</div>
                <div class="prem-plan-price">$79<span class="prem-plan-period"> once</span></div>
                <ul class="prem-plan-features">
                  <li>All features, forever</li><li>All future updates included</li>
                  <li>Lifetime priority support</li><li>Early access to new features</li>
                </ul>
                <button class="prem-plan-btn prem-plan-coming">Coming Soon</button>
              </div>
            </div>

            <div class="prem-section">
              <h2 class="prem-section-title">Free vs Premium</h2>
              <div class="prem-compare-table">
                <div class="prem-compare-header"><div>Feature</div><div>Free</div><div>Premium</div></div>
                <div class="prem-compare-row"><div>Concurrent downloads</div><div>1</div><div>Up to unlimited</div></div>
                <div class="prem-compare-row"><div>Batch import limit</div><div>50 URLs</div><div>500+ URLs</div></div>
                <div class="prem-compare-row"><div>Queue management</div><div>Basic</div><div>Advanced</div></div>
                <div class="prem-compare-row"><div>Download scheduler</div><div>✗</div><div>✓</div></div>
                <div class="prem-compare-row"><div>Custom profiles</div><div>✗</div><div>✓</div></div>
                <div class="prem-compare-row"><div>Channel archive mode</div><div>✗</div><div>✓</div></div>
                <div class="prem-compare-row"><div>Priority support</div><div>✗</div><div>✓</div></div>
                <div class="prem-compare-row"><div>Updates</div><div>Standard</div><div>Early access</div></div>
              </div>
            </div>

            <div class="prem-section">
              <h2 class="prem-section-title">Frequently Asked Questions</h2>
              <div class="prem-faq-list">
                <div class="prem-faq-item">
                  <div class="prem-faq-q">When will Premium be available?</div>
                  <div class="prem-faq-a">Premium is planned for release alongside the v1.0.0 stable launch. Pricing listed above is indicative and may change.</div>
                </div>
                <div class="prem-faq-item">
                  <div class="prem-faq-q">Can I use the free version forever?</div>
                  <div class="prem-faq-a">Yes. Sparrow Downloader will always have a free tier with single-download functionality.</div>
                </div>
                <div class="prem-faq-item">
                  <div class="prem-faq-q">Is there a trial period?</div>
                  <div class="prem-faq-a">A 7-day trial will be available when Premium launches. No credit card required to start.</div>
                </div>
              </div>
            </div>

            <div class="prem-section">
              <h2 class="prem-section-title">Roadmap</h2>
              <div class="prem-roadmap">
                <div class="prem-roadmap-item prem-roadmap-done"><div class="prem-road-dot"></div><div><strong>v1.0.0-beta.1</strong> — Core downloader, playlist, channel, batch import</div></div>
                <div class="prem-roadmap-item prem-roadmap-active"><div class="prem-road-dot"></div><div><strong>v1.0.0</strong> — Stable release, bug fixes, performance improvements</div></div>
                <div class="prem-roadmap-item"><div class="prem-road-dot"></div><div><strong>v1.1</strong> — Premium launch, Google auth, scheduler</div></div>
                <div class="prem-roadmap-item"><div class="prem-road-dot"></div><div><strong>v1.2</strong> — Custom download profiles, archive mode</div></div>
                <div class="prem-roadmap-item"><div class="prem-road-dot"></div><div><strong>v2.0</strong> — Cross-platform (macOS / Linux), cloud sync</div></div>
              </div>
            </div>

            <div class="prem-footer-note">Sparrow Downloader v1.0.0-beta.1 · Authentication &amp; payments are not yet live.</div>
          </div>
        </div><!-- /view-premium -->

      </div><!-- /content-inner -->
    </div><!-- /main-scroll -->

    <!-- Status bar -->
    <footer class="status-bar">
      <div class="status-dot ok" id="status-dot"></div>
      <span id="status-text">Ready</span>
      <div class="status-versions">
        <span class="status-version" id="ver-ytdlp"></span>
        <span class="status-sep" id="ver-sep" hidden>•</span>
        <span class="status-version" id="ver-ffmpeg"></span>
      </div>
    </footer>
  </div><!-- /main-panel -->

</div><!-- /app-shell -->`;
}

// ─────────────────────────────────────────────────────────────
// About page + Updater
// ─────────────────────────────────────────────────────────────

async function loadAbout(): Promise<void> {
  const rows = q<HTMLElement>("about-system-rows");
  if (!rows) return;
  try {
    const info = await cmd<SystemInfo>("get_system_info");
    const currentEl = q<HTMLElement>("about-ver-current");
    if (currentEl) currentEl.textContent = `v${info.app_version}`;
    rows.innerHTML = [
      ["App version", `v${info.app_version}`],
      ["Operating system", `${info.os_name} (${info.os_arch})`],
      ["yt-dlp", info.ytdlp_version ?? "Not detected"],
      ["FFmpeg", info.ffmpeg_version ?? "Not detected"],
    ]
      .map(
        ([k, v]) =>
          `<div class="about-info-row"><span class="about-info-key">${k}</span><span class="about-info-val">${v}</span></div>`,
      )
      .join("");
  } catch {
    rows.innerHTML = `<div class="about-info-row"><span class="about-info-key">Could not load system info</span></div>`;
  }
  // Restore UI to current state in case user navigated away and back.
  applyUpdaterPhase(state.updaterPhase);
}

// ── Updater state machine ──

function applyUpdaterPhase(phase: UpdaterPhase): void {
  state.updaterPhase = phase;

  const btn      = q<HTMLButtonElement>("about-check-update-btn");
  const statusEl = q<HTMLElement>("about-update-status");
  const latestEl = q<HTMLElement>("about-ver-latest");
  const panel    = q<HTMLElement>("about-update-panel");
  const dlBtn    = q<HTMLButtonElement>("aup-dl-btn");
  const rstBtn   = q<HTMLButtonElement>("aup-restart-btn");
  const progress = q<HTMLElement>("aup-progress");

  // Reset button each time
  if (btn) { btn.disabled = false; btn.textContent = ""; btn.append(mkCheckIcon(), " Check for Updates"); }

  switch (phase) {
    case "idle":
      if (statusEl) statusEl.innerHTML = "";
      break;

    case "checking":
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.innerHTML = `<span class="upd-spinner"></span>Checking…`;
      break;

    case "up-to-date":
      if (latestEl) latestEl.textContent = `v${state.pendingUpdate?.version ?? "—"}`;
      if (statusEl) statusEl.innerHTML = `<span class="upd-ok">✓ You're up to date</span>`;
      if (panel) panel.hidden = true;
      // Auto-reset after 6 s so button isn't permanently "checked"
      setTimeout(() => {
        if (state.updaterPhase === "up-to-date") applyUpdaterPhase("idle");
      }, 6000);
      break;

    case "available": {
      const upd = state.pendingUpdate!;
      if (latestEl) latestEl.textContent = `v${upd.version}`;
      if (statusEl) statusEl.innerHTML = `<span class="upd-new">🆕 New version available</span>`;
      if (panel) {
        panel.hidden = false;
        const vEl = q<HTMLElement>("aup-version");
        const nEl = q<HTMLElement>("aup-notes");
        if (vEl) vEl.textContent = `v${upd.currentVersion} → v${upd.version}`;
        if (nEl) nEl.innerHTML = upd.body
          ? upd.body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\n/g,"<br>")
          : "No release notes.";
      }
      if (dlBtn) dlBtn.hidden = false;
      if (rstBtn) rstBtn.hidden = true;
      if (progress) progress.hidden = true;
      break;
    }

    case "downloading":
      if (dlBtn) dlBtn.disabled = true;
      if (progress) progress.hidden = false;
      if (statusEl) statusEl.innerHTML = `<span class="upd-spinner"></span>Downloading…`;
      break;

    case "ready":
      if (dlBtn) dlBtn.hidden = true;
      if (rstBtn) rstBtn.hidden = false;
      if (statusEl) statusEl.innerHTML = `<span class="upd-ok">✓ Download complete — ready to install</span>`;
      break;

    case "error":
      if (statusEl) statusEl.innerHTML = `<span class="upd-err">✗ Update check failed</span>`;
      break;
  }
}

function mkCheckIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`;
  return svg;
}

async function checkForUpdates(silent = false): Promise<void> {
  if (state.updaterPhase === "checking" || state.updaterPhase === "downloading") return;

  applyUpdaterPhase("checking");
  try {
    const update = await check();
    if (update !== null) {
      state.pendingUpdate = update;
      applyUpdaterPhase("available");
      if (silent) {
        const banner   = q<HTMLElement>("update-banner");
        const bannerTx = q<HTMLElement>("update-banner-text");
        if (banner && bannerTx) {
          bannerTx.textContent = `Update available: v${update.version}`;
          banner.hidden = false;
        }
      }
    } else {
      state.pendingUpdate = null;
      applyUpdaterPhase("up-to-date");
    }
  } catch {
    if (silent) {
      applyUpdaterPhase("idle"); // silent startup — swallow network/config errors
    } else {
      applyUpdaterPhase("error");
    }
  }
}

async function startUpdateDownload(): Promise<void> {
  const update = state.pendingUpdate;
  if (!update) return;

  applyUpdaterPhase("downloading");

  const barFill = q<HTMLElement>("aup-bar-fill");
  const barLabel = q<HTMLElement>("aup-bar-label");

  let downloaded = 0;
  let total = 0;

  try {
    await update.download((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        if (barLabel) barLabel.textContent = `Starting download…`;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        if (barFill) barFill.style.width = `${pct}%`;
        if (barLabel) {
          barLabel.textContent = total > 0
            ? `${fmtBytes(downloaded)} / ${fmtBytes(total)} — ${pct}%`
            : `${fmtBytes(downloaded)} downloaded…`;
        }
      } else if (event.event === "Finished") {
        if (barFill) barFill.style.width = "100%";
        if (barLabel) barLabel.textContent = "Download complete";
        applyUpdaterPhase("ready");
      }
    });
  } catch (err) {
    const statusEl = q<HTMLElement>("about-update-status");
    if (statusEl) statusEl.innerHTML = `<span class="upd-err">✗ Download failed: ${String(err)}</span>`;
    state.updaterPhase = "error";
    const dlBtn = q<HTMLButtonElement>("aup-dl-btn");
    if (dlBtn) dlBtn.disabled = false;
  }
}

async function installUpdate(): Promise<void> {
  const update = state.pendingUpdate;
  if (!update) return;
  const rstBtn = q<HTMLButtonElement>("aup-restart-btn");
  if (rstBtn) { rstBtn.disabled = true; rstBtn.textContent = "Installing…"; }
  try {
    await update.install();
    await relaunch();
  } catch (err) {
    if (rstBtn) { rstBtn.disabled = false; rstBtn.textContent = "↻  Restart & Install Now"; }
    const statusEl = q<HTMLElement>("about-update-status");
    if (statusEl) statusEl.innerHTML = `<span class="upd-err">✗ Install failed: ${String(err)}</span>`;
  }
}

// ─────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────

function navigateTo(view: View): void {
  document
    .querySelectorAll<HTMLElement>(".view")
    .forEach((v) => v.classList.remove("is-active"));
  document.getElementById(`view-${view}`)?.classList.add("is-active");

  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset["view"] === view);
  });

  state.currentView = view;
  if (view === "history") void loadHistory();
  if (view === "settings") void loadSettings();
  if (view === "queue") void loadQueue();
  if (view === "about") void loadAbout();
}

// ─────────────────────────────────────────────────────────────
// Sidebar stats
// ─────────────────────────────────────────────────────────────

function updateStatDisplay(): void {
  const today = q<HTMLElement>("stat-today");
  const size = q<HTMLElement>("stat-size");
  const completed = q<HTMLElement>("stat-completed");
  const failed = q<HTMLElement>("stat-failed");
  if (today)
    today.textContent =
      state.stats.today > 0 ? fmtBytes(state.stats.today) : "0 B";
  if (size)
    size.textContent =
      state.stats.totalSize > 0 ? fmtBytes(state.stats.totalSize) : "0 B";
  if (completed) completed.textContent = String(state.stats.completed);
  if (failed) failed.textContent = String(state.stats.failed);
}

// Adds in-progress downloaded bytes to the DB-persisted baseline so the
// sidebar counters feel live without polling the database every second.
function updateLiveStats(): void {
  let activeBytes = 0;
  let hasActive = false;
  for (const entry of state.downloads.values()) {
    if (entry.status === "downloading") {
      hasActive = true;
      if (entry.downloadedBytes) activeBytes += entry.downloadedBytes;
    }
  }

  // Auto-stop the interval once no downloads are active — terminal-state
  // refreshStats() will have already written accurate final numbers to state.
  if (!hasActive) {
    if (state.liveStatsTimer !== null) {
      clearInterval(state.liveStatsTimer);
      state.liveStatsTimer = null;
    }
    return;
  }

  const today = q<HTMLElement>("stat-today");
  const size  = q<HTMLElement>("stat-size");
  if (today) today.textContent = fmtBytes(state.stats.today + activeBytes);
  if (size)  size.textContent  = fmtBytes(state.stats.totalSize + activeBytes);
}

function startLiveStatsTimer(): void {
  if (state.liveStatsTimer !== null) return; // already running
  state.liveStatsTimer = window.setInterval(updateLiveStats, 1000);
}

function drawSparkline(points: number[]): void {
  if (points.length < 2) return;
  const line = document.getElementById("stats-line");
  const area = document.getElementById("stats-area");
  if (!line || !area) return;

  const W = 200,
    H = 38;
  const max = Math.max(...points, 1);
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map((v) => H - (v / max) * (H - 4) - 2);

  const linePts = xs
    .map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M${xs[0].toFixed(1)},${H} ` +
    xs.map((x, i) => `L${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ") +
    ` L${xs[xs.length - 1].toFixed(1)},${H} Z`;

  line.setAttribute("points", linePts);
  area.setAttribute("d", areaPath);
}

async function refreshStats(): Promise<void> {
  try {
    const [stats, history] = await Promise.all([
      cmd<AppStatistics>("get_statistics"),
      cmd<HistoryDownload[]>("list_downloads", { limit: 200, offset: 0 }),
    ]);

    state.stats = {
      today: stats.today_bytes,
      total: stats.completed_count,
      totalSize: stats.total_bytes,
      completed: stats.completed_count,
      failed: stats.failed_count,
    };
    updateStatDisplay();

    // Build 7-day sparkline from history
    const dayBuckets = new Map<string, number>();
    for (const d of history) {
      if (d.status === "completed") {
        const bytes = d.file_size ?? d.downloaded_bytes;
        const day = new Date(d.created_at).toDateString();
        dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + bytes);
      }
    }
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(dayBuckets.get(d.toDateString()) ?? 0);
    }
    drawSparkline(days);
  } catch {
    // stats are non-critical
  }
}

// ─────────────────────────────────────────────────────────────
// Metadata rendering
// ─────────────────────────────────────────────────────────────

function renderMetadata(meta: VideoMetadata): void {
  const panel = q<HTMLElement>("metadata-panel");
  if (!panel) return;

  const titleEl = q<HTMLElement>("video-title");
  const uploaderEl = q<HTMLElement>("video-uploader");
  const metaEl = q<HTMLElement>("video-meta");
  const img = q<HTMLImageElement>("thumbnail-img");
  const durEl = q<HTMLElement>("meta-duration");

  if (titleEl) titleEl.textContent = meta.title;

  if (uploaderEl) {
    uploaderEl.innerHTML = meta.uploader
      ? `${escHtml(meta.uploader)} <span class="verified-icon">${I_VFY}</span>`
      : "";
  }

  if (img && meta.thumbnail) {
    img.src = meta.thumbnail;
    img.hidden = false;
  }

  if (durEl && meta.duration != null) {
    durEl.textContent = fmtDuration(meta.duration);
    durEl.hidden = false;
  }

  if (metaEl) {
    const badges: string[] = [];
    if (meta.duration != null)
      badges.push(
        `<span class="meta-badge">${I_CLOCK}${fmtDuration(meta.duration)}</span>`,
      );
    if (meta.view_count != null)
      badges.push(
        `<span class="meta-badge">${I_EYE}Views: ${fmtViews(meta.view_count)}</span>`,
      );
    if (meta.upload_date)
      badges.push(
        `<span class="meta-badge">${I_CAL}${fmtDate(meta.upload_date)}</span>`,
      );
    metaEl.innerHTML = badges.join("");
  }

  panel.hidden = false;

  const heights = new Set<number>();
  for (const f of meta.formats) {
    if (f.has_video && f.height != null) heights.add(f.height);
  }
  const sorted = [...heights].sort((a, b) => b - a);
  const sel = q<HTMLSelectElement>("quality-select");
  if (sel) {
    sel.innerHTML = '<option value="best">Best available</option>';
    for (const h of sorted) {
      const opt = document.createElement("option");
      opt.value = `${h}p`;
      opt.textContent =
        h >= 2160
          ? `4K — ${h}p`
          : h === 1080
            ? `${h}p (Full HD)`
            : h === 720
              ? `${h}p (HD)`
              : `${h}p`;
      if (h === 1080) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Download card build / patch
// ─────────────────────────────────────────────────────────────

function barClass(status: DownloadStatus): string {
  if (status === "downloading") return "active";
  if (status === "completed") return "complete";
  if (status === "failed") return "failed";
  if (status === "paused") return "paused";
  return "queued";
}

function buildBodyContent(entry: DownloadEntry): string {
  const pct = Math.min(100, Math.round(entry.percent));
  const bar = barClass(entry.status);

  let bytes = "";
  if (entry.status === "downloading") {
    if (entry.downloadedBytes != null && entry.totalBytes != null)
      bytes = `${fmtBytes(entry.downloadedBytes)} / ${fmtBytes(entry.totalBytes)}`;
    else if (entry.totalBytes != null) bytes = fmtBytes(entry.totalBytes);
  } else if (entry.status === "completed") {
    if (entry.outputPath) {
      const name = entry.outputPath.replace(/\\/g, "/").split("/").pop() ?? "";
      bytes = name.length > 60 ? name.slice(0, 57) + "…" : name;
    } else if (entry.totalBytes != null) {
      bytes = fmtBytes(entry.totalBytes);
    }
  } else if (entry.status === "failed" && entry.error) {
    bytes =
      entry.error.length > 60 ? entry.error.slice(0, 57) + "…" : entry.error;
  }

  return `
    <div class="dl-title" title="${escHtml(entry.title ?? entry.url)}">${escHtml(entry.title ?? entry.url)}</div>
    <div class="dl-bar-wrap"><div class="dl-bar ${bar}" style="width:${pct}%"></div></div>
    <div class="dl-bytes ${entry.status === "failed" ? "dl-error" : ""}">${escHtml(bytes)}</div>`;
}

function buildPctContent(entry: DownloadEntry): string {
  const pct = Math.min(100, Math.round(entry.percent));
  if (entry.status === "failed")
    return `<div class="dl-pct" style="font-size:13px;color:var(--danger)">Error</div>`;
  if (entry.status === "cancelled")
    return `<div class="dl-pct" style="font-size:13px;color:var(--text-faint)">—</div>`;
  if (entry.status === "paused")
    return `<div class="dl-pct" style="font-size:13px;color:var(--warning)">${pct}%</div>`;
  if (entry.status === "queued")
    return `<div class="dl-pct" style="font-size:13px;color:var(--text-muted)">Queued</div>`;
  return `<div class="dl-pct">${pct}%</div>`;
}

function buildSpeedContent(entry: DownloadEntry): string {
  if (entry.status !== "downloading") return "";
  const speed = entry.speedBps != null ? fmtSpeed(entry.speedBps) : "…";
  const eta = entry.etaSeconds != null ? `ETA ${fmtEta(entry.etaSeconds)}` : "";
  return `
    <div class="dl-speed">${I_SPEED} ${escHtml(speed)}</div>
    <div class="dl-eta">${I_CLOCK} ${escHtml(eta)}</div>`;
}

function buildActionsHtml(entry: DownloadEntry): string {
  const id = escHtml(entry.id);

  if (entry.status === "downloading") {
    return `<div class="dl-actions">
      <button class="dl-btn pause-btn" data-id="${id}" type="button"
        title="Pause download">${I_PAUSE}</button>
      <button class="dl-btn danger cancel-btn" data-id="${id}" type="button"
        title="Cancel download">${I_CANCEL}</button>
    </div>`;
  }

  if (entry.status === "queued") {
    return `<div class="dl-actions">
      <button class="dl-btn danger cancel-btn" data-id="${id}" type="button"
        title="Cancel download">${I_CANCEL}</button>
    </div>`;
  }

  if (entry.status === "paused") {
    return `<div class="dl-actions">
      <button class="dl-btn resume-btn" data-id="${id}" type="button"
        title="Resume download">${I_RESUME}</button>
      <button class="dl-btn danger cancel-btn" data-id="${id}" type="button"
        title="Remove">${I_TRASH}</button>
    </div>`;
  }

  if (entry.status === "completed" && entry.outputPath) {
    const p = escHtml(entry.outputPath);
    return `<div class="dl-actions dl-actions-row">
      <button class="dl-btn open-file-btn" data-id="${id}" data-path="${p}" type="button"
        title="Open file">${I_OPEN_FILE}</button>
      <button class="dl-btn open-folder-btn" data-id="${id}" data-path="${p}" type="button"
        title="Show in folder">${I_FOLDER}</button>
      <button class="dl-btn danger cancel-btn" data-id="${id}" type="button"
        title="Remove">${I_TRASH}</button>
    </div>`;
  }

  return `<div class="dl-actions">
    <button class="dl-btn danger cancel-btn" data-id="${id}" type="button"
      title="Remove">${I_TRASH}</button>
  </div>`;
}

function buildDownloadCard(entry: DownloadEntry): HTMLElement {
  const card = document.createElement("div");
  const cls =
    entry.status === "downloading"
      ? "is-downloading"
      : entry.status === "completed"
        ? "is-completed"
        : entry.status === "failed"
          ? "is-failed"
          : entry.status === "paused"
            ? "is-paused"
            : "";
  card.className = `dl-card ${cls}`.trim();
  card.dataset["id"] = entry.id;

  const thumbHtml = entry.thumbnailUrl
    ? `<img class="dl-thumb" src="${escHtml(entry.thumbnailUrl)}" alt="" loading="lazy"/>`
    : `<div class="dl-thumb-ph">${I_EMPTY}</div>`;

  card.innerHTML = `
    ${thumbHtml}
    <div class="dl-body">${buildBodyContent(entry)}</div>
    <div class="dl-pct-col">${buildPctContent(entry)}</div>
    <div class="dl-speed-col">${buildSpeedContent(entry)}</div>
    ${buildActionsHtml(entry)}`;

  return card;
}

function patchDownloadCard(card: HTMLElement, entry: DownloadEntry): void {
  const cls =
    entry.status === "downloading"
      ? "is-downloading"
      : entry.status === "completed"
        ? "is-completed"
        : entry.status === "failed"
          ? "is-failed"
          : entry.status === "paused"
            ? "is-paused"
            : "";
  card.className = `dl-card ${cls}`.trim();

  const body = card.querySelector<HTMLElement>(".dl-body");
  if (body) body.innerHTML = buildBodyContent(entry);

  const pctCol = card.querySelector<HTMLElement>(".dl-pct-col");
  if (pctCol) pctCol.innerHTML = buildPctContent(entry);

  const speedCol = card.querySelector<HTMLElement>(".dl-speed-col");
  if (speedCol) speedCol.innerHTML = buildSpeedContent(entry);

  const oldActions = card.querySelector<HTMLElement>(".dl-actions");
  if (oldActions) {
    const tmp = document.createElement("div");
    tmp.innerHTML = buildActionsHtml(entry);
    oldActions.replaceWith(tmp.firstElementChild!);
  }
}

function upsertDownloadCard(entry: DownloadEntry): void {
  const list = q<HTMLElement>("downloads-list");
  const empty = q<HTMLElement>("downloads-empty");
  if (!list || !empty) return;

  const existing = list.querySelector<HTMLElement>(
    `[data-id="${CSS.escape(entry.id)}"]`,
  );
  if (!existing) {
    list.insertBefore(buildDownloadCard(entry), list.firstChild);
  } else {
    patchDownloadCard(existing, entry);
  }

  const hasCards = list.children.length > 0;
  empty.hidden = hasCards;
  updateActiveCountBadge();
}

function updateActiveCountBadge(): void {
  const list = q<HTMLElement>("downloads-list");
  const badge = q<HTMLElement>("nav-dl-badge");
  const label = q<HTMLElement>("active-count-label");
  if (!list) return;

  const active = [...list.querySelectorAll(".dl-card")].filter((c) => {
    const id = (c as HTMLElement).dataset["id"];
    const e = id ? state.downloads.get(id) : null;
    return e && (e.status === "downloading" || e.status === "queued");
  }).length;

  if (badge) {
    badge.textContent = String(active);
    badge.hidden = active === 0;
  }
  if (label) {
    label.textContent = active > 0 ? `(${active})` : "";
  }
}

function clearCompleted(): void {
  const list = q<HTMLElement>("downloads-list");
  if (!list) return;
  for (const card of [...list.querySelectorAll<HTMLElement>(".dl-card")]) {
    const id = card.dataset["id"];
    const e = id ? state.downloads.get(id) : null;
    if (
      e &&
      (e.status === "completed" ||
        e.status === "failed" ||
        e.status === "cancelled")
    ) {
      state.downloads.delete(id!);
      card.remove();
    }
  }
  const empty = q<HTMLElement>("downloads-empty");
  if (empty) empty.hidden = list.children.length > 0;
  updateActiveCountBadge();
}

// ─────────────────────────────────────────────────────────────
// History view
// ─────────────────────────────────────────────────────────────

function renderHistoryItems(): void {
  const listEl = q<HTMLElement>("history-list");
  const emptyEl = q<HTMLElement>("history-empty");
  if (!listEl) return;

  let items = state.historyItems;

  // Filter by status
  if (state.historyFilter !== "all") {
    items = items.filter((d) => d.status === state.historyFilter);
  }

  // Filter by search query
  const q2 = state.historySearch.toLowerCase();
  if (q2) {
    items = items.filter((d) =>
      (d.title ?? d.url).toLowerCase().includes(q2) || d.url.toLowerCase().includes(q2),
    );
  }

  // Sort
  items = [...items].sort((a, b) => {
    if (state.historySort === "date-asc") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (state.historySort === "name") {
      return (a.title ?? a.url).localeCompare(b.title ?? b.url);
    }
    if (state.historySort === "size") {
      return (b.file_size ?? b.downloaded_bytes) - (a.file_size ?? a.downloaded_bytes);
    }
    // date-desc (default)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  listEl.innerHTML = "";

  if (items.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  for (const item of items) {
    const st = item.status as DownloadStatus;
    const dot =
      st === "completed" ? "completed" : st === "failed" ? "failed" : "cancelled";

    const size =
      (item.file_size ?? item.downloaded_bytes) > 0
        ? fmtBytes(item.file_size ?? item.downloaded_bytes)
        : "—";
    const date = item.completed_at
      ? fmtDate(item.completed_at)
      : fmtDate(item.created_at);

    const fmtLabel =
      item.format && item.quality
        ? `${item.format.toUpperCase()} ${item.quality}`
        : item.format
          ? item.format.toUpperCase()
          : null;

    const fmtBadge = fmtLabel
      ? `<span class="hist-badge other">${escHtml(fmtLabel)}</span>`
      : "";

    const hasFile = st === "completed" && item.output_path;
    const filePath = hasFile ? escHtml(item.output_path!) : "";
    const actionBtns = hasFile
      ? `<button class="dl-btn hist-open-file-btn" data-path="${filePath}" type="button"
           title="Open file">${I_OPEN_FILE}</button>
         <button class="dl-btn hist-open-folder-btn" data-path="${filePath}" type="button"
           title="Show in folder">${I_FOLDER}</button>`
      : "";

    const redownBtns = item.url
      ? `<button class="dl-btn hist-redownload-btn" data-url="${escHtml(item.url)}"
           data-format="${escHtml(item.format ?? "mp4")}"
           data-quality="${escHtml(item.quality ?? "best")}"
           data-title="${escHtml(item.title ?? "")}"
           type="button" title="Re-download">${I_REDOWN}</button>`
      : "";

    const row = document.createElement("div");
    row.className = "hist-item";
    row.innerHTML = `
      <span class="hist-dot ${dot}"></span>
      <span class="hist-title" title="${escHtml(item.url)}">${escHtml(item.title ?? item.url)}</span>
      <div class="hist-meta">
        ${fmtBadge}
        <span class="hist-badge ${dot}">${escHtml(st)}</span>
        <span class="hist-size">${escHtml(size)}</span>
        <span class="hist-date">${escHtml(date)}</span>
      </div>
      <div class="hist-actions">
        ${actionBtns}
        ${redownBtns}
        <button class="dl-btn danger hist-delete-btn" data-id="${escHtml(item.id)}" type="button"
          title="Delete from history">${I_TRASH}</button>
      </div>`;
    listEl.appendChild(row);
  }
}

async function loadHistory(): Promise<void> {
  const listEl = q<HTMLElement>("history-list");
  const emptyEl = q<HTMLElement>("history-empty");
  if (!listEl) return;

  listEl.innerHTML =
    '<div style="padding:20px;color:var(--text-faint);font-size:12px;">Loading…</div>';
  if (emptyEl) emptyEl.hidden = true;

  try {
    const all = await cmd<HistoryDownload[]>("list_downloads", {
      limit: 500,
      offset: 0,
    });
    state.historyItems = all.filter(
      (d) => d.status === "completed" || d.status === "failed" || d.status === "cancelled",
    );
    renderHistoryItems();
  } catch (err) {
    listEl.innerHTML = `<div style="padding:16px;color:var(--danger);font-size:12px;">Failed to load history: ${escHtml(String(err))}</div>`;
  }
}

// ─────────────────────────────────────────────────────────────
// Settings view
// ─────────────────────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  const content = q<HTMLElement>("settings-content");
  if (!content) return;
  content.innerHTML =
    '<div style="padding:20px;color:var(--text-faint);font-size:12px;">Loading…</div>';

  let s: AppSettings;
  try {
    s = await cmd<AppSettings>("get_settings");
  } catch {
    content.innerHTML =
      '<div style="padding:16px;color:var(--danger);font-size:12px;">Failed to load settings.</div>';
    return;
  }

  content.innerHTML = `
    <div class="settings-sections">

      <div class="settings-card">
        <div class="settings-card-hdr">Tool Paths</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">yt-dlp path</div>
            <div class="settings-row-desc">Full path to the yt-dlp executable</div>
          </div>
          <input id="s-ytdlp" class="settings-input mono" type="text"
            value="${escHtml(s.ytdlp_path ?? "")}" placeholder="Auto-detect" />
          <button class="btn-s-save" type="button" id="s-ytdlp-save">Save</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">ffmpeg path</div>
            <div class="settings-row-desc">Full path to ffmpeg (used for merging)</div>
          </div>
          <input id="s-ffmpeg" class="settings-input mono" type="text"
            value="${escHtml(s.ffmpeg_path ?? "")}" placeholder="Auto-detect" />
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-hdr">Downloads</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Output directory</div>
            <div class="settings-row-desc">Where completed downloads are saved</div>
          </div>
          <input id="s-outdir" class="settings-input" type="text"
            value="${escHtml(s.output_directory)}" />
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Max concurrent downloads</div>
            <div class="settings-row-desc">Maximum simultaneous downloads (1–8)</div>
          </div>
          <select id="s-maxconc" class="settings-select">
            ${[1, 2, 3, 4, 5, 6, 7, 8]
              .map(
                (n) =>
                  `<option value="${n}" ${n === s.max_concurrent_downloads ? "selected" : ""}>${n}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-hdr">Defaults</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Default format</div>
            <div class="settings-row-desc">Format used when not explicitly selected</div>
          </div>
          <select id="s-fmt" class="settings-select">
            <option value="mp4" ${s.default_format === "mp4" ? "selected" : ""}>MP4</option>
            <option value="webm" ${s.default_format === "webm" ? "selected" : ""}>WebM</option>
            <option value="mp3" ${s.default_format === "mp3" ? "selected" : ""}>MP3</option>
            <option value="m4a" ${s.default_format === "m4a" ? "selected" : ""}>M4A</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Default quality</div>
            <div class="settings-row-desc">Quality used when not explicitly selected</div>
          </div>
          <select id="s-qual" class="settings-select">
            ${["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"]
              .map(
                (q) =>
                  `<option value="${q}" ${s.default_quality === q ? "selected" : ""}>${q}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Desktop notifications</div>
            <div class="settings-row-desc">Show notifications when downloads complete or fail</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="s-notif" ${s.notifications_enabled !== false ? "checked" : ""}/>
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        <div class="settings-row" style="justify-content:flex-end;">
          <button class="btn-s-save" type="button" id="s-save-all">Save Settings</button>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-card-hdr">Authentication</div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="settings-row-name">Browser cookies</div>
            <div class="settings-row-desc">
              Use your browser's YouTube session to bypass bot-checks,
              age restrictions, and members-only videos.
              Close the selected browser before downloading.
            </div>
          </div>
          <select id="s-cookie-source" class="settings-select">
            <option value="disabled" ${s.cookie_source === "disabled" ? "selected" : ""}>Disabled</option>
            <option value="chrome"   ${s.cookie_source === "chrome"   ? "selected" : ""}>Chrome</option>
            <option value="edge"     ${s.cookie_source === "edge"     ? "selected" : ""}>Edge</option>
            <option value="firefox"  ${s.cookie_source === "firefox"  ? "selected" : ""}>Firefox</option>
            <option value="brave"    ${s.cookie_source === "brave"    ? "selected" : ""}>Brave</option>
          </select>
        </div>
        <div class="settings-row" style="justify-content:flex-end;gap:10px;align-items:center;">
          <span id="s-auth-result" class="settings-auth-result"></span>
          <button class="btn-s-test" type="button" id="s-test-auth">Test Authentication</button>
        </div>
      </div>

    </div>`;

  // Save yt-dlp path
  q<HTMLButtonElement>("s-ytdlp-save")?.addEventListener("click", async () => {
    const path = q<HTMLInputElement>("s-ytdlp")?.value.trim() ?? "";
    if (!path) return;
    try {
      await cmd<void>("set_ytdlp_path", { path });
      setStatus("yt-dlp path saved", "ok");
      void updateVersionDisplay();
    } catch (err) {
      setStatus(`Error: ${String(err).split(":").pop()?.trim()}`, "error");
    }
  });

  // Save all settings
  q<HTMLButtonElement>("s-save-all")?.addEventListener("click", async () => {
    const ytdlp = q<HTMLInputElement>("s-ytdlp")?.value.trim() || null;
    const ffmpeg = q<HTMLInputElement>("s-ffmpeg")?.value.trim() || null;
    const outdir =
      q<HTMLInputElement>("s-outdir")?.value.trim() ?? s.output_directory;
    const maxConc = parseInt(
      q<HTMLSelectElement>("s-maxconc")?.value ?? "2",
      10,
    );
    const fmt = q<HTMLSelectElement>("s-fmt")?.value ?? "mp4";
    const qual = q<HTMLSelectElement>("s-qual")?.value ?? "best";
    const cookieSrc = (q<HTMLSelectElement>("s-cookie-source")?.value ?? "disabled") as CookieSource;
    const notifEnabled = q<HTMLInputElement>("s-notif")?.checked ?? true;

    try {
      await cmd<void>("save_settings", {
        settings: {
          ytdlp_path: ytdlp,
          ffmpeg_path: ffmpeg,
          output_directory: outdir,
          max_concurrent_downloads: maxConc,
          default_format: fmt,
          default_quality: qual,
          cookie_source: cookieSrc,
          notifications_enabled: notifEnabled,
        },
      });
      state.notificationsEnabled = notifEnabled;
      setStatus("Settings saved", "ok");
      void updateVersionDisplay();
    } catch (err) {
      setStatus(`Error: ${String(err).split(":").pop()?.trim()}`, "error");
    }
  });

  // Test Authentication
  q<HTMLButtonElement>("s-test-auth")?.addEventListener("click", async () => {
    const resultEl = q<HTMLElement>("s-auth-result");
    const btn = q<HTMLButtonElement>("s-test-auth");
    if (!resultEl || !btn) return;

    // Save cookie_source first so the backend reads the current selection
    const cookieSrc = (q<HTMLSelectElement>("s-cookie-source")?.value ?? "disabled") as CookieSource;
    if (cookieSrc === "disabled") {
      resultEl.textContent = "Select a browser first.";
      resultEl.className = "settings-auth-result warn";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Testing…";
    resultEl.textContent = "";
    resultEl.className = "settings-auth-result";

    // Persist the selection so the Rust command reads it
    try {
      await cmd<void>("save_settings", {
        settings: {
          ytdlp_path: q<HTMLInputElement>("s-ytdlp")?.value.trim() || null,
          ffmpeg_path: q<HTMLInputElement>("s-ffmpeg")?.value.trim() || null,
          output_directory: q<HTMLInputElement>("s-outdir")?.value.trim() ?? s.output_directory,
          max_concurrent_downloads: parseInt(q<HTMLSelectElement>("s-maxconc")?.value ?? "2", 10),
          default_format: q<HTMLSelectElement>("s-fmt")?.value ?? "mp4",
          default_quality: q<HTMLSelectElement>("s-qual")?.value ?? "best",
          cookie_source: cookieSrc,
          notifications_enabled: q<HTMLInputElement>("s-notif")?.checked ?? true,
        },
      });
    } catch { /* non-fatal — test will still use last persisted state */ }

    try {
      const msg = await cmd<string>("test_auth");
      resultEl.textContent = msg;
      resultEl.className = "settings-auth-result ok";
      setStatus("Authentication test passed", "ok");
    } catch (err) {
      resultEl.textContent = String(err);
      resultEl.className = "settings-auth-result error";
      setStatus("Authentication test failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Test Authentication";
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Version display in status bar
// ─────────────────────────────────────────────────────────────

async function updateVersionDisplay(): Promise<void> {
  try {
    const s = await cmd<AppSettings>("get_settings");
    const ytEl = q<HTMLElement>("ver-ytdlp");
    const ffEl = q<HTMLElement>("ver-ffmpeg");
    const sepEl = q<HTMLElement>("ver-sep");

    if (ytEl)
      ytEl.textContent = s.ytdlp_path
        ? `yt-dlp: ${basename(s.ytdlp_path)}`
        : "";
    if (ffEl)
      ffEl.textContent = s.ffmpeg_path
        ? `ffmpeg: ${basename(s.ffmpeg_path)}`
        : "";
    if (sepEl) sepEl.hidden = !(s.ytdlp_path && s.ffmpeg_path);
  } catch {
    /* non-critical */
  }
}

function basename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

// ─────────────────────────────────────────────────────────────
// Action handlers
// ─────────────────────────────────────────────────────────────

async function onFetch(): Promise<void> {
  const input = q<HTMLInputElement>("url-input");
  const url = input?.value.trim() ?? "";
  if (!url) return;

  state.currentUrl = url;
  state.metadata = null;
  const panel = q<HTMLElement>("metadata-panel");
  if (panel) panel.hidden = true;

  const btn = q<HTMLButtonElement>("fetch-btn");
  if (btn) {
    btn.disabled = true;
    btn.querySelector("span")!.textContent = "Fetching…";
  }
  setStatus("Fetching metadata…");

  try {
    const meta = await cmd<VideoMetadata>("fetch_metadata", { url });
    state.metadata = meta;
    q<HTMLElement>("ytdlp-setup")!.hidden = true;
    renderMetadata(meta);
    setStatus(`Ready — ${meta.title}`, "ok");
  } catch (err) {
    const raw = String(err);
    if (
      raw.includes("yt-dlp not found") ||
      raw.includes("yt-dlp path is not configured")
    ) {
      q<HTMLElement>("ytdlp-setup")!.hidden = false;
      setStatus("yt-dlp not found — enter the path below", "error");
    } else {
      const m = raw.match(/ERROR[:\s]+(.+)$/m);
      setStatus(
        `Error: ${m ? m[1].trim() : (raw.split(":").pop()?.trim() ?? raw)}`,
        "error",
      );
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.querySelector("span")!.textContent = "Fetch Info";
    }
  }
}

async function onDownload(): Promise<void> {
  if (!state.metadata) return;
  const url = state.currentUrl;
  const title = state.metadata.title;
  const thumb = state.metadata.thumbnail ?? null;
  const format = q<HTMLSelectElement>("format-select")?.value ?? "mp4";
  const quality = q<HTMLSelectElement>("quality-select")?.value ?? "best";

  const btn = q<HTMLButtonElement>("download-btn");
  if (btn) btn.disabled = true;
  setStatus("Starting download…");

  try {
    const downloadId = await cmd<string>("start_download", {
      url,
      format,
      quality,
      title,
    });

    // Entry is created as "queued" — the queue worker will transition it to
    // "downloading" and emit download:started when a slot becomes available.
    // JS is single-threaded so creating this synchronously after the await
    // guarantees the entry exists before any incoming Tauri events can fire.
    const entry: DownloadEntry = {
      id: downloadId,
      url,
      title,
      thumbnailUrl: thumb,
      status: "queued",
      percent: 0,
      speedBps: null,
      etaSeconds: null,
      totalBytes: null,
      downloadedBytes: null,
      error: null,
      outputPath: null,
    };
    state.downloads.set(downloadId, entry);
    upsertDownloadCard(entry);
    setStatus("Added to queue…");
    void loadQueue();
  } catch (err) {
    const raw = String(err);
    const m = raw.match(/ERROR[:\s]+(.+)$/m);
    setStatus(
      `Error: ${m ? m[1].trim() : (raw.split(":").pop()?.trim() ?? raw)}`,
      "error",
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function onCancel(id: string): Promise<void> {
  const entry = state.downloads.get(id);
  if (!entry) return;

  if (
    entry.status === "completed" ||
    entry.status === "failed" ||
    entry.status === "cancelled"
  ) {
    void cmd<void>("delete_download", { downloadId: id }).catch(() => {});
    state.downloads.delete(id);
    const card = document.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(id)}"]`,
    );
    card?.remove();
    const list = q<HTMLElement>("downloads-list");
    const empty = q<HTMLElement>("downloads-empty");
    if (list && empty) empty.hidden = list.children.length > 0;
    updateActiveCountBadge();
    void refreshStats();
    return;
  }

  try {
    await cmd<void>("cancel_download", { downloadId: id });
    setStatus("Cancelling…");
  } catch (err) {
    setStatus(`Cancel failed: ${String(err)}`, "error");
  }
}

async function onOpenFile(path: string): Promise<void> {
  try {
    await cmd<void>("open_file", { path });
  } catch (err) {
    setStatus(`Cannot open file: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onRevealInFolder(path: string): Promise<void> {
  try {
    await cmd<void>("reveal_in_folder", { path });
  } catch (err) {
    setStatus(`Cannot reveal file: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onDeleteHistoryItem(
  id: string,
  rowEl: HTMLElement | null,
): Promise<void> {
  try {
    await cmd<void>("delete_download", { downloadId: id });
    rowEl?.remove();
    const listEl = q<HTMLElement>("history-list");
    const emptyEl = q<HTMLElement>("history-empty");
    if (listEl && emptyEl) emptyEl.hidden = listEl.children.length > 0;
    void refreshStats();
  } catch (err) {
    setStatus(`Delete failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onSaveYtdlpPath(): Promise<void> {
  const input = q<HTMLInputElement>("ytdlp-path-input");
  const path = input?.value.trim() ?? "";
  if (!path) return;

  const btn = q<HTMLButtonElement>("ytdlp-save-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving…";
  }

  try {
    await cmd<void>("set_ytdlp_path", { path });
    q<HTMLElement>("ytdlp-setup")!.hidden = true;
    setStatus("yt-dlp path saved — click Fetch Info to continue", "ok");
    void updateVersionDisplay();
  } catch (err) {
    setStatus(`Error: ${String(err).split(":").pop()?.trim()}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save";
    }
  }
}

async function onPause(id: string): Promise<void> {
  try {
    await cmd<void>("pause_download", { downloadId: id });
    setStatus("Pausing…");
  } catch (err) {
    setStatus(`Pause failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onResume(id: string): Promise<void> {
  try {
    await cmd<void>("resume_download", { downloadId: id });
    const entry = state.downloads.get(id);
    if (entry) {
      entry.status = "queued";
      upsertDownloadCard(entry);
    }
    setStatus("Resuming…");
    void loadQueue();
  } catch (err) {
    setStatus(`Resume failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onRedownload(url: string, format: string, quality: string, title: string): Promise<void> {
  try {
    const downloadId = await cmd<string>("start_download", { url, format, quality, title: title || null });
    const entry: DownloadEntry = {
      id: downloadId,
      url,
      title: title || null,
      thumbnailUrl: null,
      status: "queued",
      percent: 0,
      speedBps: null,
      etaSeconds: null,
      totalBytes: null,
      downloadedBytes: null,
      error: null,
      outputPath: null,
    };
    state.downloads.set(downloadId, entry);
    upsertDownloadCard(entry);
    setStatus("Added to queue…");
    void loadQueue();
    navigateTo("home");
  } catch (err) {
    setStatus(`Error: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

function closeDetailPanel(): void {
  const panel = q<HTMLElement>("detail-panel");
  if (panel) panel.hidden = true;
}

function openDetailPanel(entry: DownloadEntry): void {
  const panel = q<HTMLElement>("detail-panel");
  const content = q<HTMLElement>("detail-content");
  if (!panel || !content) return;

  const statusLabel: Record<string, string> = {
    downloading: "Downloading",
    queued: "Queued",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  const rows: [string, string][] = [
    ["Status", statusLabel[entry.status] ?? entry.status],
    ["Title", entry.title ?? "—"],
    ["URL", entry.url],
  ];
  if (entry.percent > 0) rows.push(["Progress", `${Math.round(entry.percent)}%`]);
  if (entry.totalBytes) rows.push(["Total size", fmtBytes(entry.totalBytes)]);
  if (entry.downloadedBytes) rows.push(["Downloaded", fmtBytes(entry.downloadedBytes)]);
  if (entry.speedBps) rows.push(["Speed", fmtSpeed(entry.speedBps)]);
  if (entry.outputPath) rows.push(["Saved to", entry.outputPath]);
  if (entry.error) rows.push(["Error", entry.error]);

  content.innerHTML = `
    ${entry.thumbnailUrl ? `<img class="detail-thumb" src="${escHtml(entry.thumbnailUrl)}" alt=""/>` : ""}
    <div class="detail-rows">
      ${rows.map(([label, value]) => `
        <div class="detail-row">
          <div class="detail-row-label">${escHtml(label)}</div>
          <div class="detail-row-value">${escHtml(value)}</div>
        </div>`).join("")}
    </div>`;

  panel.hidden = false;
}

async function onResumeAllPaused(): Promise<void> {
  const banner = q<HTMLElement>("paused-banner");
  try {
    const count = await cmd<number>("resume_all_paused");
    if (banner) banner.hidden = true;
    setStatus(count > 0 ? `Resumed ${count} paused downloads` : "No paused downloads", "ok");
    void loadQueue();
  } catch (err) {
    setStatus(`Resume all failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

// ─────────────────────────────────────────────────────────────
// Queue view
// ─────────────────────────────────────────────────────────────

async function loadQueue(): Promise<void> {
  // Update worker badge regardless of which view is active
  const activeDownloads = [...state.downloads.values()].filter(
    (e) => e.status === "downloading",
  );
  const workerText = q<HTMLElement>("queue-worker-text");
  if (workerText) workerText.textContent = `${activeDownloads.length} active`;

  const badge = q<HTMLElement>("nav-queue-badge");
  const pendingCount = [...state.downloads.values()].filter(
    (e) => e.status === "queued",
  ).length;
  const totalActive = activeDownloads.length + pendingCount;
  if (badge) {
    badge.textContent = String(totalActive);
    badge.hidden = totalActive === 0;
  }

  if (state.currentView !== "queue") return;

  const activeList   = q<HTMLElement>("queue-active-list");
  const activeHdr    = q<HTMLElement>("queue-active-hdr");
  const activeLabel  = q<HTMLElement>("queue-active-label");
  const pendingList  = q<HTMLElement>("queue-pending-list");
  const pendingHdr   = q<HTMLElement>("queue-pending-hdr");
  const pendingLabel = q<HTMLElement>("queue-pending-label");
  const emptyEl      = q<HTMLElement>("queue-empty");

  if (!activeList || !pendingList || !emptyEl) return;

  // ── Active (downloading) items from state ──
  activeList.innerHTML = "";
  if (activeDownloads.length > 0) {
    for (const entry of activeDownloads) {
      activeList.appendChild(buildQueueActiveCard(entry));
    }
    if (activeHdr) activeHdr.hidden = false;
    if (activeLabel) activeLabel.textContent = `(${activeDownloads.length})`;
  } else {
    if (activeHdr) activeHdr.hidden = true;
  }

  // ── Pending items from backend ──
  pendingList.innerHTML = "";
  let pendingItems: QueueItem[] = [];
  try {
    pendingItems = await cmd<QueueItem[]>("get_queue");
  } catch {
    pendingItems = [];
  }

  if (pendingItems.length > 0) {
    pendingItems.forEach((item, idx) => {
      pendingList.appendChild(buildQueuePendingCard(item, idx, pendingItems.length));
    });
    if (pendingHdr) pendingHdr.hidden = false;
    if (pendingLabel) pendingLabel.textContent = `(${pendingItems.length})`;
  } else {
    if (pendingHdr) pendingHdr.hidden = true;
  }

  emptyEl.hidden = activeDownloads.length > 0 || pendingItems.length > 0;
}

function buildQueueActiveCard(entry: DownloadEntry): HTMLElement {
  const pct = Math.min(100, Math.round(entry.percent));
  const speed = entry.speedBps != null ? fmtSpeed(entry.speedBps) : "";
  const eta   = entry.etaSeconds != null ? `ETA ${fmtEta(entry.etaSeconds)}` : "";
  const id    = escHtml(entry.id);

  const card = document.createElement("div");
  card.className = "queue-card is-active";
  card.dataset["id"] = entry.id;
  card.innerHTML = `
    <div class="queue-card-body">
      <div class="queue-card-title" title="${escHtml(entry.title ?? entry.url)}">${escHtml(entry.title ?? entry.url)}</div>
      <div class="queue-card-bar-wrap"><div class="queue-card-bar" style="width:${pct}%"></div></div>
      <div class="queue-card-meta">
        ${speed ? `<span>${I_SPEED} ${escHtml(speed)}</span>` : ""}
        ${eta   ? `<span>${I_CLOCK} ${escHtml(eta)}</span>`   : ""}
        <span class="queue-pct">${pct}%</span>
      </div>
    </div>
    <div class="queue-card-actions">
      <button class="dl-btn danger q-cancel-btn" data-id="${id}" type="button" title="Cancel">${I_CANCEL}</button>
    </div>`;
  return card;
}

function buildQueuePendingCard(item: QueueItem, idx: number, total: number): HTMLElement {
  const id    = escHtml(item.download_id);
  const title = escHtml(item.title ?? item.url);
  const meta  = [item.format?.toUpperCase(), item.quality].filter(Boolean).join(" • ");

  const card = document.createElement("div");
  card.className = "queue-card is-pending";
  card.dataset["id"] = item.download_id;
  const atTop    = idx === 0;
  const atBottom = idx + 1 >= total;
  card.innerHTML = `
    <div class="queue-pos">#${idx + 1}</div>
    <div class="queue-card-body">
      <div class="queue-card-title" title="${title}">${title}</div>
      ${meta ? `<div class="queue-card-meta-text">${escHtml(meta)}</div>` : ""}
    </div>
    <div class="queue-card-actions">
      <button class="dl-btn q-top-btn${atTop ? " disabled" : ""}"
        data-id="${id}" type="button" title="Move to top"
        ${atTop ? "disabled" : ""}>${I_TOP}</button>
      <button class="dl-btn q-move-up-btn${atTop ? " disabled" : ""}"
        data-id="${id}" type="button" title="Move up"
        ${atTop ? "disabled" : ""}>${I_UP}</button>
      <button class="dl-btn q-move-down-btn${atBottom ? " disabled" : ""}"
        data-id="${id}" type="button" title="Move down"
        ${atBottom ? "disabled" : ""}>${I_DOWN}</button>
      <button class="dl-btn q-bottom-btn${atBottom ? " disabled" : ""}"
        data-id="${id}" type="button" title="Move to bottom"
        ${atBottom ? "disabled" : ""}>${I_BOTTOM}</button>
      <button class="dl-btn danger q-remove-btn" data-id="${id}" type="button"
        title="Remove from queue">${I_CANCEL}</button>
    </div>`;
  return card;
}

async function onQueueMoveUp(id: string): Promise<void> {
  try {
    await cmd<void>("queue_move_up", { downloadId: id });
    void loadQueue();
  } catch (err) {
    setStatus(`Move failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onQueueMoveDown(id: string): Promise<void> {
  try {
    await cmd<void>("queue_move_down", { downloadId: id });
    void loadQueue();
  } catch (err) {
    setStatus(`Move failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onQueueRemove(id: string): Promise<void> {
  try {
    await cmd<void>("queue_remove_item", { downloadId: id });
  } catch (err) {
    setStatus(`Remove failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onQueueMoveToTop(id: string): Promise<void> {
  try {
    await cmd<void>("queue_move_to_top", { downloadId: id });
    void loadQueue();
  } catch (err) {
    setStatus(`Move failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

async function onQueueMoveToBottom(id: string): Promise<void> {
  try {
    await cmd<void>("queue_move_to_bottom", { downloadId: id });
    void loadQueue();
  } catch (err) {
    setStatus(`Move failed: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  }
}

// ─────────────────────────────────────────────────────────────
// Playlist view
// ─────────────────────────────────────────────────────────────

function buildVideoListItem(
  entry: PlaylistEntry,
  index: number,
  selectedIds: Set<string>,
  idPrefix: string,
): HTMLElement {
  const item = document.createElement("div");
  item.className = "bulk-video-item";
  item.dataset["id"] = entry.id;

  const checked = selectedIds.has(entry.id) ? "checked" : "";
  const dur = entry.duration != null ? fmtDuration(entry.duration) : "";
  const thumbHtml = entry.thumbnail
    ? `<img class="bulk-video-thumb" src="${escHtml(entry.thumbnail)}" alt="" loading="lazy"/>`
    : `<div class="bulk-video-thumb-ph">${I_VIDEO}</div>`;

  item.innerHTML = `
    <label class="bulk-video-check">
      <input type="checkbox" class="bulk-cb" data-id="${escHtml(entry.id)}" ${checked}/>
      <span class="bulk-cb-box"></span>
    </label>
    <span class="bulk-video-num">${index + 1}</span>
    ${thumbHtml}
    <div class="bulk-video-body">
      <div class="bulk-video-title" title="${escHtml(entry.title)}">${escHtml(entry.title)}</div>
      ${entry.uploader ? `<div class="bulk-video-uploader">${escHtml(entry.uploader)}</div>` : ""}
    </div>
    ${dur ? `<span class="bulk-video-dur">${escHtml(dur)}</span>` : ""}`;

  item.querySelector<HTMLInputElement>(".bulk-cb")?.addEventListener("change", (e) => {
    const cb = e.target as HTMLInputElement;
    if (cb.checked) selectedIds.add(entry.id);
    else selectedIds.delete(entry.id);
    updateBulkSelectionLabel(idPrefix, selectedIds.size);
  });

  return item;
}

function updateBulkSelectionLabel(prefix: string, count: number): void {
  const label = q<HTMLElement>(`${prefix}-download-label`);
  if (label) label.textContent = count > 0 ? `Download Selected (${count})` : "Download Selected";
}

function renderPlaylistPanel(meta: PlaylistMetadata): void {
  state.playlistMeta = meta;
  state.playlistSelectedIds = new Set(meta.entries.map((e) => e.id));

  const panel = q<HTMLElement>("pl-panel");
  const empty = q<HTMLElement>("pl-empty");
  if (!panel || !empty) return;

  const thumb = q<HTMLImageElement>("pl-thumb");
  if (thumb && meta.thumbnail) { thumb.src = meta.thumbnail; thumb.hidden = false; }

  const titleEl = q<HTMLElement>("pl-title");
  if (titleEl) titleEl.textContent = meta.title;

  const uploaderEl = q<HTMLElement>("pl-uploader");
  if (uploaderEl) uploaderEl.textContent = meta.uploader ?? "";

  const statsEl = q<HTMLElement>("pl-stats");
  if (statsEl) {
    const dur = meta.total_duration != null ? ` • ${fmtDuration(meta.total_duration)}` : "";
    statsEl.textContent = `${meta.entry_count} videos${dur}`;
  }

  const list = q<HTMLElement>("pl-video-list");
  if (list) {
    list.innerHTML = "";
    meta.entries.forEach((entry, i) => {
      list.appendChild(buildVideoListItem(entry, i, state.playlistSelectedIds, "pl"));
    });
  }

  updateBulkSelectionLabel("pl", state.playlistSelectedIds.size);
  panel.hidden = false;
  empty.hidden = true;
}

async function onPlaylistFetch(): Promise<void> {
  const input = q<HTMLInputElement>("pl-url-input");
  const url = input?.value.trim() ?? "";
  if (!url) return;

  const btn = q<HTMLButtonElement>("pl-fetch-btn");
  if (btn) { btn.disabled = true; btn.querySelector("span")!.textContent = "Fetching…"; }
  setStatus("Fetching playlist…", "active");

  const panel = q<HTMLElement>("pl-panel");
  const empty = q<HTMLElement>("pl-empty");
  if (panel) panel.hidden = true;
  if (empty) empty.hidden = true;

  try {
    const meta = await cmd<PlaylistMetadata>("fetch_playlist", { url, limit: null });
    renderPlaylistPanel(meta);
    setStatus(`Playlist loaded — ${meta.title} (${meta.entry_count} videos)`, "ok");
  } catch (err) {
    if (empty) empty.hidden = false;
    setStatus(`Error: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector("span")!.textContent = "Fetch Playlist"; }
  }
}

async function onPlaylistDownload(): Promise<void> {
  const meta = state.playlistMeta;
  if (!meta || state.playlistSelectedIds.size === 0) return;

  const selected = meta.entries.filter((e) => state.playlistSelectedIds.has(e.id));
  const format = q<HTMLSelectElement>("pl-format")?.value ?? "mp4";
  const quality = q<HTMLSelectElement>("pl-quality")?.value ?? "best";

  const btn = q<HTMLButtonElement>("pl-download-btn");
  if (btn) btn.disabled = true;
  setStatus(`Queueing ${selected.length} videos…`, "active");

  try {
    const count = await cmd<number>("start_playlist_download", {
      playlistUrl: meta.webpage_url,
      playlistTitle: meta.title,
      playlistThumbnail: meta.thumbnail,
      entries: selected.map((e) => ({ url: e.url, title: e.title })),
      format,
      quality,
    });
    setStatus(`Added ${count} videos to queue`, "ok");
    void loadQueue();
  } catch (err) {
    setStatus(`Error: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Channel view
// ─────────────────────────────────────────────────────────────

function renderChannelPanel(meta: PlaylistMetadata): void {
  state.channelMeta = meta;
  state.channelSelectedIds = new Set(meta.entries.map((e) => e.id));

  const panel = q<HTMLElement>("ch-panel");
  const empty = q<HTMLElement>("ch-empty");
  if (!panel || !empty) return;

  const thumb = q<HTMLImageElement>("ch-thumb");
  if (thumb && meta.thumbnail) { thumb.src = meta.thumbnail; thumb.hidden = false; }

  const nameEl = q<HTMLElement>("ch-name");
  if (nameEl) nameEl.textContent = meta.title;

  const statsEl = q<HTMLElement>("ch-stats");
  if (statsEl) statsEl.textContent = `${meta.entry_count} videos loaded`;

  const list = q<HTMLElement>("ch-video-list");
  if (list) {
    list.innerHTML = "";
    meta.entries.forEach((entry, i) => {
      list.appendChild(buildVideoListItem(entry, i, state.channelSelectedIds, "ch"));
    });
  }

  updateBulkSelectionLabel("ch", state.channelSelectedIds.size);
  panel.hidden = false;
  empty.hidden = true;
}

async function onChannelFetch(): Promise<void> {
  const input = q<HTMLInputElement>("ch-url-input");
  const url = input?.value.trim() ?? "";
  if (!url) return;

  const limitVal = q<HTMLSelectElement>("ch-limit-select")?.value ?? "25";
  const limit = limitVal ? parseInt(limitVal, 10) : null;

  const btn = q<HTMLButtonElement>("ch-fetch-btn");
  if (btn) { btn.disabled = true; btn.querySelector("span")!.textContent = "Fetching…"; }
  setStatus("Fetching channel…", "active");

  const panel = q<HTMLElement>("ch-panel");
  const empty = q<HTMLElement>("ch-empty");
  if (panel) panel.hidden = true;
  if (empty) empty.hidden = true;

  try {
    const meta = await cmd<PlaylistMetadata>("fetch_playlist", { url, limit });
    renderChannelPanel(meta);
    setStatus(`Channel loaded — ${meta.title} (${meta.entry_count} videos)`, "ok");
  } catch (err) {
    if (empty) empty.hidden = false;
    setStatus(`Error: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector("span")!.textContent = "Fetch Channel"; }
  }
}

async function onChannelDownload(): Promise<void> {
  const meta = state.channelMeta;
  if (!meta || state.channelSelectedIds.size === 0) return;

  const selected = meta.entries.filter((e) => state.channelSelectedIds.has(e.id));
  const format = q<HTMLSelectElement>("ch-format")?.value ?? "mp4";
  const quality = q<HTMLSelectElement>("ch-quality")?.value ?? "best";
  const limitVal = q<HTMLSelectElement>("ch-limit-select")?.value ?? "";

  const btn = q<HTMLButtonElement>("ch-download-btn");
  if (btn) btn.disabled = true;
  setStatus(`Queueing ${selected.length} videos…`, "active");

  try {
    const count = await cmd<number>("start_channel_download", {
      channelUrl: meta.webpage_url,
      channelName: meta.uploader ?? meta.title,
      channelThumbnail: meta.thumbnail,
      limitMode: limitVal || null,
      entries: selected.map((e) => ({ url: e.url, title: e.title })),
      format,
      quality,
    });
    setStatus(`Added ${count} videos to queue`, "ok");
    void loadQueue();
  } catch (err) {
    setStatus(`Error: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Batch import view
// ─────────────────────────────────────────────────────────────

function renderBatchSummary(result: BatchValidationResult, queued?: boolean): void {
  const el = q<HTMLElement>("batch-summary");
  if (!el) return;

  const invalid = result.invalid_urls.slice(0, 5);
  const moreInvalid = result.invalid_count > 5 ? result.invalid_count - 5 : 0;

  el.innerHTML = `
    <div class="batch-summary-grid">
      <div class="batch-stat ok">
        <div class="batch-stat-val">${result.valid_count}</div>
        <div class="batch-stat-lbl">Valid${queued ? " (Queued)" : ""}</div>
      </div>
      <div class="batch-stat ${result.invalid_count > 0 ? "err" : ""}">
        <div class="batch-stat-val">${result.invalid_count}</div>
        <div class="batch-stat-lbl">Invalid</div>
      </div>
      <div class="batch-stat ${result.duplicate_count > 0 ? "warn" : ""}">
        <div class="batch-stat-val">${result.duplicate_count}</div>
        <div class="batch-stat-lbl">Duplicates Skipped</div>
      </div>
    </div>
    ${invalid.length > 0 ? `
    <div class="batch-invalid-list">
      <div class="batch-invalid-hdr">Invalid URLs:</div>
      ${invalid.map((u) => `<div class="batch-invalid-url">${escHtml(u)}</div>`).join("")}
      ${moreInvalid > 0 ? `<div class="batch-invalid-url" style="color:var(--text-faint)">…and ${moreInvalid} more</div>` : ""}
    </div>` : ""}`;
  el.hidden = false;
}

async function onBatchValidate(): Promise<void> {
  const text = q<HTMLTextAreaElement>("batch-textarea")?.value ?? "";
  if (!text.trim()) return;

  setStatus("Validating URLs…", "active");
  try {
    const result = await cmd<BatchValidationResult>("validate_batch_urls", { rawText: text });
    state.batchValidation = result;
    renderBatchSummary(result, false);
    setStatus(
      `${result.valid_count} valid, ${result.invalid_count} invalid, ${result.duplicate_count} duplicates`,
      result.invalid_count > 0 ? "error" : "ok",
    );
  } catch (err) {
    setStatus(`Validation error: ${String(err)}`, "error");
  }
}

async function onBatchImport(): Promise<void> {
  const text = q<HTMLTextAreaElement>("batch-textarea")?.value ?? "";
  if (!text.trim()) return;

  const format = q<HTMLSelectElement>("batch-format")?.value ?? "mp4";
  const quality = q<HTMLSelectElement>("batch-quality")?.value ?? "best";

  const btn = q<HTMLButtonElement>("batch-import-btn");
  if (btn) btn.disabled = true;
  setStatus("Importing to queue…", "active");

  try {
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const result = await cmd<BatchValidationResult>("start_batch_download", {
      urls: lines,
      format,
      quality,
    });
    state.batchValidation = result;
    renderBatchSummary(result, true);
    setStatus(`Queued ${result.valid_count} downloads`, "ok");
    void loadQueue();
  } catch (err) {
    setStatus(`Import error: ${String(err).split(":").pop()?.trim() ?? err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────
// DOM event wiring
// ─────────────────────────────────────────────────────────────

function wireDomEvents(): void {
  // Nav tabs
  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset["view"] as View | undefined;
      if (view) navigateTo(view);
    });
  });

  // URL input
  q<HTMLButtonElement>("fetch-btn")?.addEventListener(
    "click",
    () => void onFetch(),
  );
  q<HTMLInputElement>("url-input")?.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Enter") void onFetch();
    },
  );

  // yt-dlp setup
  q<HTMLButtonElement>("ytdlp-save-btn")?.addEventListener(
    "click",
    () => void onSaveYtdlpPath(),
  );
  q<HTMLInputElement>("ytdlp-path-input")?.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Enter") void onSaveYtdlpPath();
    },
  );

  // Download button
  q<HTMLButtonElement>("download-btn")?.addEventListener(
    "click",
    () => void onDownload(),
  );

  // Paused banner
  q<HTMLButtonElement>("resume-all-btn")?.addEventListener("click", () => void onResumeAllPaused());
  q<HTMLButtonElement>("dismiss-banner-btn")?.addEventListener("click", () => {
    q<HTMLElement>("paused-banner")!.hidden = true;
  });

  // Detail panel close
  q<HTMLButtonElement>("detail-close")?.addEventListener("click", closeDetailPanel);
  q<HTMLElement>("detail-backdrop")?.addEventListener("click", closeDetailPanel);

  // Active download card actions — delegated
  q<HTMLElement>("downloads-list")?.addEventListener("click", (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const pauseBtn = t.closest<HTMLButtonElement>(".pause-btn");
    if (pauseBtn?.dataset["id"]) { void onPause(pauseBtn.dataset["id"]!); return; }
    const resumeBtn = t.closest<HTMLButtonElement>(".resume-btn");
    if (resumeBtn?.dataset["id"]) { void onResume(resumeBtn.dataset["id"]!); return; }
    const cancelBtn = t.closest<HTMLButtonElement>(".cancel-btn");
    if (cancelBtn?.dataset["id"]) { void onCancel(cancelBtn.dataset["id"]!); return; }
    const openFileBtn = t.closest<HTMLButtonElement>(".open-file-btn");
    if (openFileBtn?.dataset["path"]) {
      void onOpenFile(openFileBtn.dataset["path"]!); return;
    }
    const openFolderBtn = t.closest<HTMLButtonElement>(".open-folder-btn");
    if (openFolderBtn?.dataset["path"]) {
      void onRevealInFolder(openFolderBtn.dataset["path"]!); return;
    }
    // Click on card body → open detail panel
    const card = t.closest<HTMLElement>(".dl-card");
    if (card?.dataset["id"]) {
      const entry = state.downloads.get(card.dataset["id"]!);
      if (entry) openDetailPanel(entry);
    }
  });

  // History toolbar
  q<HTMLInputElement>("hist-search")?.addEventListener("input", (e) => {
    state.historySearch = (e.target as HTMLInputElement).value;
    renderHistoryItems();
  });
  q<HTMLSelectElement>("hist-sort")?.addEventListener("change", (e) => {
    state.historySort = (e.target as HTMLSelectElement).value as typeof state.historySort;
    renderHistoryItems();
  });
  document.querySelectorAll<HTMLButtonElement>(".hist-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".hist-chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      state.historyFilter = chip.dataset["filter"] as typeof state.historyFilter;
      renderHistoryItems();
    });
  });

  // History item actions — delegated
  q<HTMLElement>("history-list")?.addEventListener("click", (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const openFileBtn = t.closest<HTMLButtonElement>(".hist-open-file-btn");
    if (openFileBtn?.dataset["path"]) { void onOpenFile(openFileBtn.dataset["path"]!); return; }
    const openFolderBtn = t.closest<HTMLButtonElement>(".hist-open-folder-btn");
    if (openFolderBtn?.dataset["path"]) { void onRevealInFolder(openFolderBtn.dataset["path"]!); return; }
    const redownBtn = t.closest<HTMLButtonElement>(".hist-redownload-btn");
    if (redownBtn) {
      void onRedownload(
        redownBtn.dataset["url"] ?? "",
        redownBtn.dataset["format"] ?? "mp4",
        redownBtn.dataset["quality"] ?? "best",
        redownBtn.dataset["title"] ?? "",
      );
      return;
    }
    const deleteBtn = t.closest<HTMLButtonElement>(".hist-delete-btn");
    if (deleteBtn?.dataset["id"]) {
      void onDeleteHistoryItem(
        deleteBtn.dataset["id"]!,
        deleteBtn.closest<HTMLElement>(".hist-item"),
      );
      return;
    }
  });

  // Clear completed
  q<HTMLButtonElement>("clear-completed")?.addEventListener(
    "click",
    clearCompleted,
  );

  // History refresh
  q<HTMLButtonElement>("history-refresh")?.addEventListener(
    "click",
    () => void loadHistory(),
  );

  // Queue refresh
  q<HTMLButtonElement>("queue-refresh")?.addEventListener(
    "click",
    () => void loadQueue(),
  );

  // Queue pending list actions — delegated
  q<HTMLElement>("queue-pending-list")?.addEventListener("click", (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const topBtn  = t.closest<HTMLButtonElement>(".q-top-btn");
    const upBtn   = t.closest<HTMLButtonElement>(".q-move-up-btn");
    const downBtn = t.closest<HTMLButtonElement>(".q-move-down-btn");
    const botBtn  = t.closest<HTMLButtonElement>(".q-bottom-btn");
    const rmBtn   = t.closest<HTMLButtonElement>(".q-remove-btn");
    if (topBtn?.dataset["id"])  { void onQueueMoveToTop(topBtn.dataset["id"]!);    return; }
    if (upBtn?.dataset["id"])   { void onQueueMoveUp(upBtn.dataset["id"]!);        return; }
    if (downBtn?.dataset["id"]) { void onQueueMoveDown(downBtn.dataset["id"]!);    return; }
    if (botBtn?.dataset["id"])  { void onQueueMoveToBottom(botBtn.dataset["id"]!); return; }
    if (rmBtn?.dataset["id"])   { void onQueueRemove(rmBtn.dataset["id"]!);        return; }
  });

  // Queue active list cancel — delegated
  q<HTMLElement>("queue-active-list")?.addEventListener("click", (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const cancelBtn = t.closest<HTMLButtonElement>(".q-cancel-btn");
    if (cancelBtn?.dataset["id"]) { void onCancel(cancelBtn.dataset["id"]!); return; }
  });

  // ── Playlist view ──
  q<HTMLButtonElement>("pl-fetch-btn")?.addEventListener("click", () => void onPlaylistFetch());
  q<HTMLInputElement>("pl-url-input")?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") void onPlaylistFetch();
  });
  q<HTMLButtonElement>("pl-select-all")?.addEventListener("click", () => {
    const meta = state.playlistMeta;
    if (!meta) return;
    state.playlistSelectedIds = new Set(meta.entries.map((e) => e.id));
    q<HTMLElement>("pl-video-list")?.querySelectorAll<HTMLInputElement>(".bulk-cb").forEach((cb) => {
      cb.checked = true;
    });
    updateBulkSelectionLabel("pl", state.playlistSelectedIds.size);
  });
  q<HTMLButtonElement>("pl-deselect-all")?.addEventListener("click", () => {
    state.playlistSelectedIds.clear();
    q<HTMLElement>("pl-video-list")?.querySelectorAll<HTMLInputElement>(".bulk-cb").forEach((cb) => {
      cb.checked = false;
    });
    updateBulkSelectionLabel("pl", 0);
  });
  q<HTMLButtonElement>("pl-download-btn")?.addEventListener("click", () => void onPlaylistDownload());

  // ── Channel view ──
  q<HTMLButtonElement>("ch-fetch-btn")?.addEventListener("click", () => void onChannelFetch());
  q<HTMLInputElement>("ch-url-input")?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") void onChannelFetch();
  });
  q<HTMLButtonElement>("ch-select-all")?.addEventListener("click", () => {
    const meta = state.channelMeta;
    if (!meta) return;
    state.channelSelectedIds = new Set(meta.entries.map((e) => e.id));
    q<HTMLElement>("ch-video-list")?.querySelectorAll<HTMLInputElement>(".bulk-cb").forEach((cb) => {
      cb.checked = true;
    });
    updateBulkSelectionLabel("ch", state.channelSelectedIds.size);
  });
  q<HTMLButtonElement>("ch-deselect-all")?.addEventListener("click", () => {
    state.channelSelectedIds.clear();
    q<HTMLElement>("ch-video-list")?.querySelectorAll<HTMLInputElement>(".bulk-cb").forEach((cb) => {
      cb.checked = false;
    });
    updateBulkSelectionLabel("ch", 0);
  });
  q<HTMLButtonElement>("ch-download-btn")?.addEventListener("click", () => void onChannelDownload());

  // ── Batch view ──
  q<HTMLButtonElement>("batch-validate-btn")?.addEventListener("click", () => void onBatchValidate());
  q<HTMLButtonElement>("batch-import-btn")?.addEventListener("click", () => void onBatchImport());

  // ── Sidebar CTA ──
  q<HTMLElement>("sidebar-cta-premium")?.addEventListener("click", () => navigateTo("premium"));
  q<HTMLElement>("sidebar-cta-premium")?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("premium"); }
  });

  // ── Premium page ──
  q<HTMLButtonElement>("prem-google-btn")?.addEventListener("click", () => {
    const note = q<HTMLElement>("prem-google-note");
    if (note) note.hidden = false;
  });

  // ── About → Premium link ──
  document.querySelectorAll<HTMLButtonElement>("[data-view='premium']").forEach((btn) => {
    if (!btn.classList.contains("nav-item")) {
      btn.addEventListener("click", () => navigateTo("premium"));
    }
  });

  // ── About page: updater controls ──
  q<HTMLButtonElement>("about-check-update-btn")?.addEventListener("click", () => void checkForUpdates(false));
  q<HTMLButtonElement>("aup-dl-btn")?.addEventListener("click", () => void startUpdateDownload());
  q<HTMLButtonElement>("aup-restart-btn")?.addEventListener("click", () => void installUpdate());

  // ── Update available banner ──
  q<HTMLButtonElement>("update-banner-view-btn")?.addEventListener("click", () => {
    q<HTMLElement>("update-banner")!.hidden = true;
    navigateTo("about");
  });
  q<HTMLButtonElement>("update-banner-dismiss-btn")?.addEventListener("click", () => {
    q<HTMLElement>("update-banner")!.hidden = true;
  });
}

// ─────────────────────────────────────────────────────────────
// Tauri event listeners
// ─────────────────────────────────────────────────────────────

async function registerTauriEvents(): Promise<void> {
  const ul: UnlistenFn[] = [];

  ul.push(
    await listen<StartedPayload>("download:started", (event) => {
      const { download_id, title, url } = event.payload;
      let entry = state.downloads.get(download_id);
      if (entry) {
        entry.status = "downloading";
      } else {
        // Race: event arrived before the invoke response created the entry.
        // Seed state so progress events render correctly.
        entry = {
          id: download_id,
          url,
          title,
          thumbnailUrl: null,
          status: "downloading",
          percent: 0,
          speedBps: null,
          etaSeconds: null,
          totalBytes: null,
          downloadedBytes: null,
          error: null,
          outputPath: null,
        };
        state.downloads.set(download_id, entry);
      }
      upsertDownloadCard(entry);
      setStatus(`Downloading…`);
      startLiveStatsTimer();
      void loadQueue();
    }),
  );

  ul.push(
    await listen<ProgressPayload>("download:progress", (event) => {
      const { download_id, progress } = event.payload;
      const entry = state.downloads.get(download_id);
      if (!entry) return;
      if (entry.status === "queued") entry.status = "downloading";
      entry.percent = progress.percent;
      entry.speedBps = progress.speed_bps;
      entry.etaSeconds = progress.eta_seconds;
      entry.totalBytes = progress.total_bytes;
      entry.downloadedBytes = progress.downloaded_bytes;
      upsertDownloadCard(entry);

      // Status bar: "<title> — 45% — 5.2 MB/s — ETA 00:23"
      const pct = Math.round(progress.percent);
      const parts: string[] = [`${pct}%`];
      if (progress.speed_bps != null) parts.push(fmtSpeed(progress.speed_bps));
      if (progress.eta_seconds != null) parts.push(`ETA ${fmtEta(progress.eta_seconds)}`);
      setStatus(`${entry.title ?? "Downloading"} — ${parts.join(" — ")}`, "active");

      // Patch the active card in the queue view if visible
      if (state.currentView === "queue") {
        const qCard = q<HTMLElement>("queue-active-list")?.querySelector<HTMLElement>(
          `[data-id="${CSS.escape(download_id)}"]`,
        );
        if (qCard) {
          const newCard = buildQueueActiveCard(entry);
          qCard.replaceWith(newCard);
        }
      }
    }),
  );

  ul.push(
    await listen<CompletedPayload>("download:completed", (event) => {
      const { download_id, output_path } = event.payload;
      const entry = state.downloads.get(download_id);
      if (entry) {
        entry.status = "completed";
        entry.percent = 100;
        entry.speedBps = null;
        entry.etaSeconds = null;
        entry.outputPath = output_path;
        upsertDownloadCard(entry);
        setStatus(`Completed — ${entry.title ?? entry.url}`, "ok");
        sendNotification("Download Complete", entry.title ?? entry.url, download_id);
      }
      void refreshStats();
      void loadQueue();
    }),
  );

  ul.push(
    await listen<FailedPayload>("download:failed", (event) => {
      const { download_id, error } = event.payload;
      const entry = state.downloads.get(download_id);
      if (entry) {
        entry.status = "failed";
        entry.error = error;
        entry.speedBps = null;
        entry.etaSeconds = null;
        upsertDownloadCard(entry);
        setStatus(`Failed — ${error}`, "error");
        sendNotification("Download Failed", `${entry.title ?? entry.url}: ${error}`, download_id);
      }
      void refreshStats();
      void loadQueue();
    }),
  );

  ul.push(
    await listen<CancelledPayload>("download:cancelled", (event) => {
      const entry = state.downloads.get(event.payload.download_id);
      if (entry) {
        entry.status = "cancelled";
        entry.speedBps = null;
        entry.etaSeconds = null;
        upsertDownloadCard(entry);
        setStatus(`Cancelled — ${entry.title ?? entry.url}`);
      }
      void refreshStats();
      void loadQueue();
    }),
  );

  ul.push(
    await listen<PausedPayload>("download:paused", (event) => {
      const entry = state.downloads.get(event.payload.download_id);
      if (entry) {
        entry.status = "paused";
        entry.speedBps = null;
        entry.etaSeconds = null;
        upsertDownloadCard(entry);
        setStatus(`Paused — ${entry.title ?? entry.url}`);
      }
      void loadQueue();
    }),
  );

  ul.push(
    await listen<void>("queue:changed", () => {
      void loadQueue();
    }),
  );

  state.unlisteners = ul;
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

export async function initApp(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("#app root not found");

  buildLayout(root);
  wireDomEvents();
  await registerTauriEvents();
  setStatus("Ready", "ok");

  // Request desktop notification permission on first run
  if ("Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission();
  }

  // Load notification preference from settings
  try {
    const s = await cmd<AppSettings>("get_settings");
    state.notificationsEnabled = s.notifications_enabled !== false;
  } catch { /* non-critical */ }

  // Show startup banner if paused items exist
  try {
    const stats = await cmd<AppStatistics>("get_statistics");
    if (stats.paused_count > 0) {
      const banner = q<HTMLElement>("paused-banner");
      const bannerText = q<HTMLElement>("paused-banner-text");
      if (banner && bannerText) {
        bannerText.textContent =
          `${stats.paused_count} download${stats.paused_count > 1 ? "s" : ""} paused from last session.`;
        banner.hidden = false;
      }
    }
  } catch { /* non-critical */ }

  void updateVersionDisplay();
  void refreshStats();

  // Silent startup update check — errors are swallowed, banner shown if update found.
  void checkForUpdates(true);
}
