# Proposal

## Why

When the open file changes on disk while the document has unsaved changes, mded always stops and shows the conflict bar, and the user has to pick one whole version: *Reload from disk* or *Keep mine*. Most of the time the two sides touched different lines (Claude Code edits a section while the user writes in another, a sync client brings a fix to a paragraph the user is not touching), so the choice is unnecessary and either answer loses something. The baseline kept since `reload-on-disk-change` is exactly the common ancestor a three-way merge needs, so the conflict can be avoided in the common case without new bookkeeping.

## What Changes

- **Automatic line-based three-way merge.** When the file changes on disk and the document has unsaved changes, mded merges the change into the buffer, using the last content read from or written to disk as the base, the buffer as one side and the new file as the other. The merge happens only if no changed lines on the two sides overlap or touch. Otherwise nothing is applied and the conflict bar is shown, as today.
- The merge only adds the other program's changes to the buffer: the user's text is left as typed, the cursor and scroll stay put, the document stays unsaved, and one undo removes exactly the merged changes. An informational bar says that changes from disk were merged and are highlighted. It has a *Clear highlight* action and goes away with the highlight.
- **Save with an unnoticed external change.** If Cmd+S finds that the file changed and the change can be merged, mded merges it, does **not** write the file, and shows the same informational bar so the user reviews and saves again. It never writes a combination the user has not seen.
- While the conflict bar is up, each further change on disk retries the merge against the same base. If it now merges cleanly, the bar goes away.
- **Highlight of incoming lines.** Lines that came from disk are highlighted with a soft background. After a merge, the highlight stays until the document is saved (or otherwise matches the disk again). After a reload (automatic or *Reload from disk*), it fades out after a moment. Resting the pointer on a highlighted line shows a native tooltip saying it came from disk.
- Clean reloads apply the change line by line instead of as one replacement spanning from the first change to the last, so the cursor keeps its place more precisely and the highlight covers only the lines that changed.

Out of scope: merging changes within a line (word or character level), a diff or compare view, conflict markers in the text, partial merges (applying the non-conflicting parts of a conflicting change), highlighting deleted lines, and a size threshold for refusing large merges.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `file-sync`: unsaved changes no longer always mean a conflict: non-overlapping external changes are merged automatically, a save that finds a mergeable external change merges instead of showing the bar, the conflict bar is limited to overlapping changes, and lines loaded from disk are highlighted.

## Impact

- `src/editor/`: a new pure line diff and three-way merge (unit-tested), producing a transaction in the buffer's coordinates or a conflict; `reloadTransaction` moves to line hunks; a `StateField` for the incoming-lines highlight.
- `src/main.ts`: `applyDisk()` tries the merge before showing the conflict bar, knows whether it was called from a save, keeps the informational bar in step with the highlight, and clears the highlight when the document matches the disk again.
- `src/editor/setup.ts` / `src/styles.css`: highlight colors for light and dark, and the fade.
- `src/bar.ts` / `src/styles.css`: an informational `merged` bar with a *Clear highlight* button.
- `e2e/`: tests for clean merge, overlapping conflict, merge on save, retry while the bar is up, undo of a merge and the highlight's lifetime.
- No new dependencies. No changes to `src/platform/` or `src-tauri/`.
- `ROADMAP.md` (remove the *Later* item), `README.md` (*Features*), `CHANGELOG.md` (*Unreleased*), `AGENTS.md` (structure).
