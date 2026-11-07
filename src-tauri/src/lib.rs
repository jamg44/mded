use std::path::PathBuf;
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager};

/// Files coming from the system (Finder "Open With", double click) before the
/// frontend is listening. When the frontend calls `initial_files` the queue is
/// marked ready, and from then on files are sent as an `open-files` event.
#[derive(Default)]
struct OpenQueue {
    ready: bool,
    pending: Vec<String>,
}

/// A poisoned Mutex must not take the app down: the queue is still valid.
fn lock(queue: &Mutex<OpenQueue>) -> std::sync::MutexGuard<'_, OpenQueue> {
    queue.lock().unwrap_or_else(|e| e.into_inner())
}

/// Reads a text file (UTF-8).
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {path}: {e}"))
}

/// Writes the content as is: the editor never rewrites the markdown.
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not save {path}: {e}"))
}

/// Files the app was launched with: the Finder queue plus the command line
/// (`mded notes.md`, which on Windows/Linux is also how "Open With" arrives).
#[tauri::command]
fn initial_files(queue: tauri::State<'_, Mutex<OpenQueue>>) -> Vec<String> {
    let mut q = lock(&queue);
    q.ready = true;
    let mut files = std::mem::take(&mut q.pending);
    files.extend(
        std::env::args()
            .skip(1)
            .filter(|a| !a.starts_with('-'))
            .filter_map(|a| absolute_file(PathBuf::from(a))),
    );
    files
}

fn absolute_file(path: PathBuf) -> Option<String> {
    let abs = std::fs::canonicalize(&path).unwrap_or(path);
    abs.is_file().then(|| abs.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Registered here and not in setup(): macOS delivers "Open With" files
        // before the Ready event, which is when Tauri runs setup().
        .manage(Mutex::new(OpenQueue::default()))
        .invoke_handler(tauri::generate_handler![read_file, write_file, initial_files])
        .build(tauri::generate_context!())
        .expect("failed to start mded")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let files: Vec<String> = urls
                    .into_iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .filter_map(absolute_file)
                    .collect();
                // In release a panic here is an abort (panic = "abort"): no unwrap
                let Some(queue) = _app.try_state::<Mutex<OpenQueue>>() else {
                    return;
                };
                let mut q = lock(&queue);
                if q.ready {
                    let _ = _app.emit("open-files", files);
                } else {
                    q.pending.extend(files);
                }
            }
        });
}
