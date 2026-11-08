# Design

## Context

See proposal.md (Why) and specs/file-sync/spec.md for the required behavior.

Current state relevant to the approach:

- `src/main.ts` keeps `path` and `saved: Text` (the document as last loaded or saved) only to compute `isDirty()`. `writeTo()` calls `platform.writeFile` with no check. `load()` rebuilds the whole `EditorState` with `view.setState`, which drops undo history and scroll position.
- `createState()` (`src/editor/setup.ts`) fixes `EditorState.lineSeparator` to `\r\n` when the text contains it. The separator is chosen once per state.
- `src-tauri/src/lib.rs` exposes `read_file` / `write_file` / `initial_files`; shared state is registered with `.manage()` on the builder. Release builds use `panic = "abort"`, so callbacks must not `unwrap`.
- The web platform (`src/platform/web.ts`) keeps files in an in-memory `Map`, exposed to e2e tests through `window.__mded.platform`.
- Native dialogs are not testable from the browser; DOM UI is.

## Goals / Non-Goals

**Goals:**
- One place (`main.ts`) owns the sync logic, shared by both platforms; platforms only provide a change trigger.
- Every requirement except native change detection is covered by unit or e2e tests.
- The baseline kept by this design is enough for a future three-way merge, without changing it.

**Non-Goals:**
- Merging, a compare view, watching more than the open file.
- Making `write_file` atomic (temp file + rename). It changes the file's identity (inode, xattrs, hard links) and is a separate decision.

## Decisions

### 1. The baseline is the raw disk string, compared by content

`main.ts` keeps `disk: string | null`: exactly what was last read from or written to `path` (`null` for untitled, or when the file is known to be missing). Every check reads the file and compares strings.

- *Why content and not mtime:* mtime is preserved by `cp -p`, `rsync -t` and some sync clients, and touching a file changes it without changing content. Reading one markdown file is cheap.
- *Why a raw string and not `saved: Text`:* the `Text` is split into lines and loses the distinction the save path depends on. `saved` stays for `isDirty()`.
- *Own writes need no special handling:* after `writeTo`, `disk` equals the file, so the watcher event caused by that write compares equal and is ignored. No time-based suppression window.
- *Future merge:* `disk` is the common ancestor of the buffer ("mine") and the new file ("theirs"), which is exactly the base a three-way merge needs.

### 2. Save is compare-and-swap in `main.ts`

`writeTo(p)` with `p === path`: read the file, compare with `disk`, write only if equal; otherwise hand the content to the same `applyDisk()` decision the watcher uses (reload if the document has no unsaved changes, conflict bar if it has), so a save on a clean document never shows a conflict for nothing. A missing file when `disk === null` (deleted state) also allows the write. *Save As* to a new path skips the check (nothing to protect) but, if the target exists, the save dialog has already asked the user to replace it.

- *Alternative:* a Rust `write_file_if(path, contents, expected)`. Narrower race window, but splits logic across platforms and the web platform would need a copy. The read-then-write window is a few milliseconds; the watcher covers the rest.

### 3. Detection: platform trigger, logic in `main.ts`

New `Platform` members:

```
watchFile(path: string | null): Promise<void>   // replaces any previous watch; null stops
onFileChanged(handler: (path: string) => void): Promise<void>
readFileIfExists(path: string): Promise<string | null>   // null = missing; other failures throw
```

`readFileIfExists` exists so that "deleted" is never confused with "could not be read" (permissions, not UTF-8): an unreadable file must not turn the document into a deleted one.

`main.ts` calls `watchFile` whenever `path` changes (open, Save As, New) and also runs the same check on window focus (via `window` `focus`, no Tauri API needed). The handler ignores events whose path is not the current `path`.

The check itself (`syncFromDisk()`):

```
read file
  missing  -> deleted state (info bar, disk = null, document unsaved)
  == disk  -> nothing (clear deleted/conflict state if it was showing)
  != disk  -> if doc == new content: adopt as baseline, mark saved, hide bar
              else if clean:        reload (decision 4) + notice
              else:                 conflict state (bar)
```

Everything that reads the disk and then decides (the checks, the save, the two bar buttons) runs through one promise chain, so they happen one at a time and an event during a read cannot apply stale content. Checks that arrive while one is already waiting share it. Each decision is taken synchronously right after its read, against the editor state at that moment.

### 4. Reload is a minimal-diff transaction

A pure function in `src/editor/reload.ts` returns the single replacement `{from, to, insert}` between the current text and the new one (common prefix and suffix, never splitting a surrogate pair), and `reloadTransaction(state, content)` wraps it in a transaction (its own undo step) or answers `'rebuild'`. `main.ts` dispatches it, so:

- the cursor is mapped through the change and scroll stays put;
- undo restores the pre-reload text (spec: undo after reload);
- `saved` is set to the new doc, so the document is clean.

If the line separator would change (the new content has `\r\n` and the state does not, or the reverse), the separator facet must change, which a plain transaction cannot do: fall back to `load()`-style `setState` for that case. Losing undo history there is acceptable; it is rare.

- *Alternative:* a line-level diff (Myers) for several smaller replacements, keeping more cursor positions exact. Prefix/suffix is enough for the common case of one edited region and is trivial to test; revisit with the merge work.

### 5. Rust watcher on the parent directory

`watch_file(path: Option<String>)` command. State: `Mutex<Option<Debouncer>>` registered with `.manage()`. It watches the file's **parent directory, non-recursive**, and emits `file-changed` with the path when a debounced event touches that file name.

- *Why the parent directory:* editors and `git` save by writing a temp file and renaming it over the original. A watch on the file itself follows the old inode and goes silent after the first such save.
- *Debounce ~200 ms:* collapses bursts and lowers the chance of reading a half-written file.
- *Crates:* `notify-debouncer-mini` 0.7, which brings `notify` 8 and re-exports it (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows), so there is a single declared dependency and no version skew. Neither was in the tree before.
- *Testing:* the watcher logic is a plain function (`start_watcher`) with Rust tests against the real filesystem: in-place write, atomic replace followed by a second one, delete and come back, neighbor files ignored.
- A `read_file_if_exists` command backs `readFileIfExists`.
- *Alternative:* polling `stat` from the frontend every 1-2 s. No new crates, but adds latency and misses content changes that keep size and mtime. Rejected.
- *Alternative:* `tauri-plugin-fs` `watch`. Requires fs scopes broad enough to cover any path the user opens, plus a plugin only for this. Rejected in favor of a command consistent with `read_file` / `write_file`.
- No `unwrap` in the watcher callback; a failed emit is ignored. Failure to start a watch is non-fatal: focus checks and the save check still protect the file.
- Permissions: a custom command needs no new capability entry; the frontend `listen` is covered by `core:default`.

### 6. Bars and notice are plain DOM in `index.html`

One bar element above the editor with two variants:

- **conflict** (warning tokens): message plus *Reload from disk* / *Keep mine* buttons;
- **deleted** (info tokens): message only.

Plus a separate transient notice ("Reloaded from disk") that fades out after ~2.5 s. Buttons use `mousedown` `preventDefault` so clicking does not move focus from the editor; the bar has `role="alert"`, the notice `role="status"`. Colors are new tokens in `styles.css` for light and dark. The bar takes layout space (the editor shrinks) rather than overlaying the first lines.

- *Why not a native dialog:* a modal can be answered by an accidental Return while typing, and *Keep mine* is the destructive answer. DOM UI is also e2e-testable.

### 7. Web platform for tests

`web.ts` implements `watchFile` as a no-op that records the path and `onFileChanged` by storing the handler; it exposes `simulateExternalChange(path, contents | null, notify = true)` that updates the in-memory map (deletions are remembered, or a read would fetch the file again from the dev server) and calls the handler if the path is the watched one. `notify: false` is a change the watcher missed. E2E tests use it through `window.__mded.platform`, and `window.__mded.settled()` waits for the queued file checks.

## Risks / Trade-offs

- [Reading a file while another program is still writing it] → debounce, and the deferred check runs again on the next event; a truncated read on a clean document would be followed by the final content shortly after. A conflict bar shown on partial content re-reads on click.
- [Watcher misses events (sleep, network volumes, FSEvents coalescing)] → focus check plus compare-and-swap on save.
- [Read-then-write race on save] → window of milliseconds; accepted.
- [Large external rewrite moves the cursor to a mapped but unexpected spot] → acceptable; the notice tells the user the text changed.
- [Line-ending change drops undo history] → rare; documented in decision 4.
- [Watching the parent directory of a busy folder fires many events] → filtered by file name in Rust before emitting; debounced.
- [Native detection is not testable from the browser] → manual test checklist in tasks (external editor, `git checkout`, vim-style atomic save, delete and restore).

## Open Questions

- Exact debounce and notice durations; tune by daily use.
