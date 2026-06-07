mod commands;
mod database;
mod downloader;
mod error;
mod extractor;
mod media;
mod queue;
mod settings;
mod state;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use tauri::Manager;
use tokio::sync::Notify;

use settings::Settings;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let conn = database::open(&data_dir.join("downloads.db"))?;
            let mut settings = Settings::load_from_db(&conn)?;

            if settings.ytdlp_path.is_none() {
                if let Some(p) = settings::detect_ytdlp_path() {
                    tracing::info!("auto-detected yt-dlp at {:?}", p);
                    let _ = database::settings_set(&conn, "ytdlp_path", &p.to_string_lossy());
                    settings.ytdlp_path = Some(p);
                }
            }
            if settings.ffmpeg_path.is_none() {
                if let Some(p) = settings::detect_ffmpeg_path() {
                    tracing::info!("auto-detected ffmpeg at {:?}", p);
                    let _ = database::settings_set(&conn, "ffmpeg_path", &p.to_string_lossy());
                    settings.ffmpeg_path = Some(p);
                }
            }

            // Recover any downloads that were mid-flight when the app last closed.
            match database::reset_interrupted_downloads(&conn) {
                Ok(0) => {}
                Ok(n) => tracing::info!("startup: marked {n} interrupted download(s) as paused for resume"),
                Err(e) => tracing::warn!("startup: recovery query failed: {e}"),
            }

            let queue_notify = Arc::new(Notify::new());

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                active_downloads: Arc::new(Mutex::new(HashMap::new())),
                settings: Arc::new(RwLock::new(settings)),
                queue_notify: Arc::clone(&queue_notify),
            });

            // Spawn the queue worker that respects max_concurrent_downloads.
            let state = app.state::<AppState>();
            let worker_app    = app.handle().clone();
            let worker_db     = Arc::clone(&state.db);
            let worker_active = Arc::clone(&state.active_downloads);
            let worker_sett   = Arc::clone(&state.settings);
            let worker_notify = Arc::clone(&queue_notify);

            tauri::async_runtime::spawn(queue::run(
                worker_app,
                worker_db,
                worker_active,
                worker_sett,
                Arc::clone(&worker_notify),
            ));

            // Drain any items left in queue_order from a previous session.
            worker_notify.notify_one();

            tracing::info!("database ready, queue worker started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::set_ytdlp_path,
            commands::fetch_metadata,
            commands::start_download,
            commands::cancel_download,
            commands::get_download,
            commands::list_downloads,
            commands::test_auth,
            commands::open_file,
            commands::reveal_in_folder,
            commands::delete_download,
            // Queue
            commands::get_queue,
            commands::queue_move_up,
            commands::queue_move_down,
            commands::queue_remove_item,
            // Playlist / channel / batch
            commands::fetch_playlist,
            commands::start_playlist_download,
            commands::start_channel_download,
            commands::validate_batch_urls,
            commands::start_batch_download,
            // Pause / Resume
            commands::pause_download,
            commands::resume_download,
            // Queue extras
            commands::queue_move_to_top,
            commands::queue_move_to_bottom,
            // Statistics & recovery
            commands::get_statistics,
            commands::resume_all_paused,
            // About page
            commands::get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
