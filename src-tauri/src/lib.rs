use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use tauri::Emitter;
#[cfg(target_os = "macos")]
use tauri::Manager;

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

/// Like `read_file`, but a missing file is `None` and not an error: the editor tells
/// "deleted by another program" apart from "could not be read".
#[tauri::command]
fn read_file_if_exists(path: String) -> Result<Option<String>, String> {
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {path}: {e}")),
    }
}

/// Writes the content as is: the editor never rewrites the markdown.
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not save {path}: {e}"))
}

/// The watcher of the open file. Replacing the value drops (and so stops) the previous one.
#[derive(Default)]
struct FileWatch(Mutex<Option<Debouncer<RecommendedWatcher>>>);

/// Calls `on_change` whenever something happens to the file at `path`, after a short quiet
/// period (so a program that is still writing is not read half-way).
///
/// Watches the parent directory and filters by file name instead of watching the file:
/// editors, git and sync tools save by writing a temporary file and renaming it over the
/// original, which leaves a watch on the file itself following the old, now unlinked, file.
/// The event is only a hint, so extra or duplicate events are harmless.
fn start_watcher(
    path: &Path,
    on_change: impl Fn() + Send + 'static,
) -> Result<Debouncer<RecommendedWatcher>, String> {
    let name = path
        .file_name()
        .ok_or_else(|| format!("{} is not a file path", path.display()))?
        .to_owned();
    let dir = match path.parent() {
        Some(d) if !d.as_os_str().is_empty() => d,
        _ => Path::new("."),
    };
    // Runs on the watcher's thread: no unwrap, and nothing to do if the event is an error
    let mut debouncer = new_debouncer(Duration::from_millis(200), move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        if events.iter().any(|e| e.path.file_name() == Some(name.as_os_str())) {
            on_change();
        }
    })
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Could not watch {}: {e}", dir.display()))?;
    Ok(debouncer)
}

/// Watches the open file (`None` = stop watching). Emits `file-changed` with the path.
#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, FileWatch>,
    path: Option<String>,
) -> Result<(), String> {
    let mut slot = state.0.lock().unwrap_or_else(|e| e.into_inner());
    *slot = None;
    let Some(path) = path else { return Ok(()) };
    let reported = path.clone();
    *slot = Some(start_watcher(Path::new(&path), move || {
        let _ = app.emit("file-changed", &reported);
    })?);
    Ok(())
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

/// Turns off the macOS "smart" substitutions that WebKit would otherwise apply to
/// what is typed in the editor (`--` → `—`, `"` → `“`, spelling auto-correction):
/// they silently rewrite markdown syntax. WebKit reads these keys from the app's
/// defaults and falls back to the system-wide setting only when a key is absent.
///
/// `registerDefaults` and not `setBool`: registered values live in memory and are
/// never written to the user's preferences, and a value the user sets explicitly
/// for this app still wins. Text replacement (the user's own shortcuts) and the
/// spell-check underline are left alone on purpose.
#[cfg(target_os = "macos")]
fn disable_text_substitutions() {
    use objc2_foundation::{NSDictionary, NSNumber, NSString, NSUserDefaults};

    let keys = [
        NSString::from_str("WebAutomaticQuoteSubstitutionEnabled"),
        NSString::from_str("WebAutomaticDashSubstitutionEnabled"),
        NSString::from_str("WebAutomaticSpellingCorrectionEnabled"),
    ];
    let key_refs = [&*keys[0], &*keys[1], &*keys[2]];
    let off = [(); 3].map(|_| NSNumber::numberWithBool(false).into_super().into_super().into_super());
    let defaults = NSDictionary::from_retained_objects(&key_refs, &off);
    // SAFETY: the dictionary maps NSString keys to NSNumber values, which is what
    // `registerDefaults:` expects.
    unsafe { NSUserDefaults::standardUserDefaults().registerDefaults(&defaults) };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before the webview exists, so WebKit never sees the system setting
    #[cfg(target_os = "macos")]
    disable_text_substitutions();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Registered here and not in setup(): macOS delivers "Open With" files
        // before the Ready event, which is when Tauri runs setup().
        .manage(Mutex::new(OpenQueue::default()))
        .manage(FileWatch::default())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_file_if_exists,
            write_file,
            initial_files,
            watch_file
        ])
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::mpsc::{Receiver, channel};

    /// Fresh directory per test (tests run in parallel).
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mded-watch-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    /// Starts watching `path` and waits until the OS has nothing left to report about the
    /// setup, so that the test only sees what it causes.
    fn watch(path: &Path) -> (Debouncer<RecommendedWatcher>, Receiver<()>) {
        let (tx, rx) = channel();
        let watcher = start_watcher(path, move || {
            let _ = tx.send(());
        })
        .expect("start watcher");
        while rx.recv_timeout(Duration::from_millis(700)).is_ok() {}
        (watcher, rx)
    }

    /// The watcher reported something within a few seconds.
    fn fired(rx: &Receiver<()>) -> bool {
        rx.recv_timeout(Duration::from_secs(5)).is_ok()
    }

    /// Nothing was reported for a while, and the queue is left empty.
    fn quiet(rx: &Receiver<()>) -> bool {
        rx.recv_timeout(Duration::from_millis(900)).is_err()
    }

    #[test]
    fn reports_an_in_place_write() {
        let dir = temp_dir("write");
        let file = dir.join("notes.md");
        fs::write(&file, "one").expect("write");
        let (_watcher, rx) = watch(&file);

        fs::write(&file, "two").expect("write");
        assert!(fired(&rx));
    }

    #[test]
    fn keeps_reporting_after_an_atomic_replace() {
        // What editors and git do: write a temporary file and rename it over the original
        let dir = temp_dir("atomic");
        let file = dir.join("notes.md");
        fs::write(&file, "one").expect("write");
        let (_watcher, rx) = watch(&file);

        let tmp = dir.join(".notes.md.tmp");
        fs::write(&tmp, "two").expect("write tmp");
        fs::rename(&tmp, &file).expect("rename");
        assert!(fired(&rx), "the first replace is reported");
        assert!(quiet(&rx));

        // A watch on the file itself would be following the old inode and miss this
        fs::write(&tmp, "three").expect("write tmp");
        fs::rename(&tmp, &file).expect("rename");
        assert!(fired(&rx), "a later replace is still reported");
    }

    #[test]
    fn reports_a_delete_and_the_file_coming_back() {
        let dir = temp_dir("delete");
        let file = dir.join("notes.md");
        fs::write(&file, "one").expect("write");
        let (_watcher, rx) = watch(&file);

        fs::remove_file(&file).expect("remove");
        assert!(fired(&rx), "the delete is reported");
        assert!(quiet(&rx));

        fs::write(&file, "back").expect("write");
        assert!(fired(&rx), "the file coming back is reported");
    }

    #[test]
    fn ignores_other_files_in_the_same_directory() {
        let dir = temp_dir("others");
        let file = dir.join("notes.md");
        fs::write(&file, "one").expect("write");
        let (_watcher, rx) = watch(&file);

        fs::write(dir.join("other.md"), "x").expect("write other");
        assert!(quiet(&rx));
    }

    #[test]
    fn stops_when_dropped() {
        let dir = temp_dir("drop");
        let file = dir.join("notes.md");
        fs::write(&file, "one").expect("write");
        let (watcher, rx) = watch(&file);

        drop(watcher);
        fs::write(&file, "two").expect("write");
        assert!(quiet(&rx));
    }

    #[test]
    fn rejects_a_path_without_a_file_name() {
        assert!(start_watcher(Path::new("/"), || {}).is_err());
    }

    #[test]
    fn read_file_if_exists_tells_missing_from_present() {
        let dir = temp_dir("read");
        let file = dir.join("notes.md");
        let path = file.to_string_lossy().into_owned();
        assert_eq!(read_file_if_exists(path.clone()), Ok(None));
        fs::write(&file, "text").expect("write");
        assert_eq!(read_file_if_exists(path), Ok(Some("text".to_string())));
        // Not valid UTF-8 is an error, not "missing"
        fs::write(&file, [0xff, 0xfe, 0x00]).expect("write bytes");
        assert!(read_file_if_exists(file.to_string_lossy().into_owned()).is_err());
    }
}
