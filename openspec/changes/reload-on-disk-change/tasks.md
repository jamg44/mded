# Tasks

## 1. Minimal-diff replacement

- [x] 1.1 Add a pure function in `src/editor/` that returns the single `{from, to, insert}` replacement between two strings (common prefix and suffix), and verify with unit tests: identical texts (no change), edit in the middle, insert at start/end, full replacement, and multi-byte characters (emoji) not split
- [x] 1.2 Add `reloadTransaction(state, content)`, which turns that replacement into one transaction (its own undo step) or answers `'rebuild'` when the line separator would change, and verify with unit tests that cursor positions in unchanged text are preserved, that undo returns the previous text, and that a `\n` → `\r\n` reload yields `sliceDoc()` identical to the new content

## 2. Baseline and compare-and-swap save

- [x] 2.1 In `src/main.ts`, keep the raw disk content (`disk: string | null`) set on open and after every successful write, and verify `pnpm check` passes with no behavior change in existing e2e tests
- [x] 2.2 Make `writeTo()` re-read the file and write only when it matches `disk` (or when the file is missing in the deleted state), entering the conflict state otherwise; verify with an e2e test that changes the in-memory file behind the editor's back, saves, and checks the file keeps the external content and the document stays unsaved
- [x] 2.3 Verify with an e2e test that two consecutive saves with an edit in between both write and show no conflict

## 3. Platform change trigger

- [x] 3.1 Add `watchFile(path | null)` and `onFileChanged(handler)` to the `Platform` interface in `src/platform/types.ts`, and verify `tsc` passes with both implementations
- [x] 3.2 Implement them in `src/platform/web.ts` with `simulateExternalChange(path, contents | null)` (updates or deletes the in-memory file and calls the handler), and verify it is reachable from `window.__mded.platform` in an e2e test
- [x] 3.3 Add `notify-debouncer-mini` (which brings and re-exports `notify`) to `src-tauri/Cargo.toml`, a `read_file_if_exists` command and a `watch_file(path: Option<String>)` command in `lib.rs` that watches the parent directory (non-recursive), filters by file name, debounces ~200 ms and emits `file-changed`; state in a `Mutex<Option<…>>` registered with `.manage()`, no `unwrap` in callbacks; verify `cargo clippy --all-targets` has no warnings and `cargo test` passes (watcher tests against the real filesystem)
- [x] 3.4 Implement `watchFile` / `onFileChanged` in `src/platform/tauri.ts` via `invoke('watch_file')` and `listen('file-changed')`, and verify `pnpm check` passes

## 4. Sync logic

- [x] 4.1 Add `syncFromDisk()` in `src/main.ts` (read, compare with `disk`, then: nothing / adopt / reload / conflict / deleted), serialized so only one check runs at a time with a re-run flag; call `watchFile` whenever `path` changes and run the check on `onFileChanged` for the current path and on window `focus`. Verify with e2e tests: external change to a clean document reloads it and keeps it saved; a touch with identical content does nothing; an untitled document ignores changes
- [x] 4.2 Verify with an e2e test that undo after an automatic reload restores the previous text and marks the document unsaved
- [x] 4.3 Verify with an e2e test that a CRLF file reloaded after an external change and saved without edits is written byte-identical (`\r\n` preserved)

## 5. Bars and notice

- [x] 5.1 Add the bar element and the transient notice to `index.html`, with warning and info color tokens for light and dark in `src/styles.css`; buttons must not take focus from the editor (`mousedown` `preventDefault`), the bar has `role="alert"` and the notice `role="status"`. Verify with an e2e screenshot of each variant in light and dark
- [x] 5.2 Show the "Reloaded from disk" notice after an automatic reload and hide it after ~2.5 s; verify with an e2e test that it appears, that typing still goes to the editor, and that it disappears
- [x] 5.3 Show the conflict bar when the file changes with unsaved edits; verify with e2e tests that the text is kept, keys typed afterwards go to the editor, and the bar disappears when the document is edited to match the disk
- [x] 5.4 Implement *Reload from disk* (re-read at click time, reload via 1.2, mark saved, hide bar) and verify with an e2e test, including that undo afterwards restores the user's text as unsaved
- [x] 5.5 Implement *Keep mine* (adopt current disk content as baseline, hide bar) and verify with e2e tests that the next save writes the file, and that a further external change shows the bar again
- [x] 5.6 Show the deleted/moved info bar (keep text, mark unsaved, `disk = null`), hide it when saving recreates the file or when the file reappears; verify with e2e tests for delete, save-recreates and file-comes-back

## 6. Documentation

- [x] 6.1 Update `ROADMAP.md`: remove "Reload from file changed on disk" from *Now*, and add to *Later* an item for automatic conflict resolution: a three-way merge using the last disk version as the common base, so that changes on disk to lines not edited in the buffer (the common case) are merged without asking, and only overlapping edits fall back to the conflict bar. Verify the file reads correctly
- [x] 6.2 Add the feature to *Features* in `README.md`, and update the structure section of `AGENTS.md` with any new file and the `watch_file` command; add a *Known pitfalls* entry about watching the parent directory because of atomic saves. Verify the paths mentioned exist

## 7. Integration and manual checks

- [x] 7.1 Run `pnpm check` and `pnpm e2e` and verify both pass; review the bar and notice screenshots in `screenshots/`
- [x] 7.2 Manual test in the native app (`pnpm app`), reporting each result to the user: edit the open file from another editor (VS Code or vim, atomic save); `git checkout` of the file; edit from Claude Code while mded is in front; delete and restore the file; Save As to a new path then edit the new path externally; save right after an external change missed by the watcher (compare-and-swap)

## Workflow follow-up

- Archive the change with `/opsx:archive` once implemented and manually verified.
