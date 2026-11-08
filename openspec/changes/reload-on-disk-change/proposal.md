# Proposal

## Why

mded writes the file blindly on Cmd+S and never looks at the disk again after opening it. If another program changes the file (Claude Code, another editor, `git pull`, a sync client), mded keeps showing the stale text, and the next save silently overwrites the newer version with the older one. That makes mded unreliable as a daily editor next to other tools, which is how it is used.

## What Changes

- mded remembers the exact content it last read from or wrote to disk (the *baseline*) and compares the disk against it by content, not by modification time.
- **Save never overwrites an external change.** Before writing, mded checks that the disk still matches the baseline. If it does not, the file is not written and the conflict bar is shown instead.
- **Live reload while the file is open.** A native file watcher (plus a check when the window regains focus) detects changes made by other programs while mded is in front.
  - No unsaved changes: the editor reloads the new content silently, keeping cursor and scroll, and shows a discreet transient notice ("Reloaded from disk"). The previous text stays reachable with undo.
  - Unsaved changes: a persistent, non-modal warning bar appears with two actions, *Reload from disk* and *Keep mine*. It never steals focus and cannot be triggered by typing.
- **File deleted or moved:** the text is kept, the document becomes unsaved, and an informational bar says that saving will recreate the file.
- The roadmap gets a *Later* item for automatic conflict resolution (three-way merge of non-overlapping changes), which this change makes possible but does not implement.

Out of scope: merging changes, a diff/compare view, and watching files other than the one open.

## Capabilities

### New Capabilities
- `file-sync`: how the open document stays consistent with its file on disk: detecting external changes, reloading, saving without overwriting newer content, and surfacing conflicts and deleted files.

### Modified Capabilities

None.

## Impact

- `src/main.ts`: baseline, save check, reload and conflict state.
- `src/editor/`: a pure function that computes the minimal replacement between two texts (unit-tested).
- `src/platform/types.ts`, `tauri.ts`, `web.ts`: a way to watch the open file and receive change notifications; the web platform exposes a manual trigger for e2e tests.
- `src-tauri/src/lib.rs`: a `watch_file` command backed by a file watcher on the file's parent directory, held in managed state.
- `src-tauri/Cargo.toml`: new dependency `notify-debouncer-mini`, which brings `notify` (neither was in the dependency tree).
- `index.html` / `styles.css`: the warning/info bar and the transient notice, with light and dark tokens.
- `e2e/`: tests for silent reload, the conflict bar, the save check and the deleted-file bar, driven through the web platform's in-memory files.
- Manual testing required for the native watcher (external editors, atomic saves, `git checkout`).
- `ROADMAP.md`: remove the item from *Now*, add the conflict-resolution item to *Later*.
