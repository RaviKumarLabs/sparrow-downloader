use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};

use rusqlite::Connection;
use tokio::sync::Notify;

use crate::settings::Settings;

pub struct DownloadHandle {
    pub cancel_flag: Arc<AtomicBool>,
    /// Set alongside cancel_flag when the user wants pause (not full cancel).
    /// The downloader finish path checks this to decide the terminal status.
    pub pause_flag: Arc<AtomicBool>,
    pub child: Arc<tokio::sync::Mutex<Option<tokio::process::Child>>>,
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub active_downloads: Arc<Mutex<HashMap<String, DownloadHandle>>>,
    pub settings: Arc<RwLock<Settings>>,
    /// Notified when a download slot may have opened or a new item was enqueued.
    /// The queue worker wakes on this to drain the queue.
    pub queue_notify: Arc<Notify>,
}
