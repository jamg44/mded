# Tasks

## 1. Line diff

- [x] 1.1 Add `src/editor/linediff.ts` with a Myers line diff over two `Text` values (compare `line(n).text`, trim common leading and trailing lines first) returning hunks `{ fromA, toA, fromB, toB }` in line numbers. Verify with unit tests in `src/editor/linediff.test.ts`: identical texts (no hunks), one changed line, inserted and deleted lines at start, middle and end, file with and without a trailing newline, CRLF content built with a `\r\n` state (a lone `\n` inside a line is not a break), and a file of several thousand lines with a few scattered changes finishing quickly

## 2. Three-way merge

- [x] 2.1 Add `mergeChanges(state, base, theirs)` in `src/editor/merge.ts`. It diffs base → buffer and base → theirs, detects conflicts with the overlap-or-touch rule (including insertions at the same point), drops hunks identical on both sides, returns `'conflict'` when the separator of `base` or `theirs` differs from the state's, and otherwise maps the other side's hunks (narrowed with `minimalReplacement`) through the user's into one transaction (`isolateHistory`, `userEvent: 'reload.merge'`). Verify with unit tests: changes on distant lines merge and leave the buffer's own text intact; overlapping, adjacent and same-point insertions give `'conflict'`; an identical change on both sides merges with no duplicate; a cursor in the user's text keeps its place; undo of the transaction gives back the pre-merge buffer; CRLF inputs merge with `sliceDoc()` keeping `\r\n`; a separator change gives `'conflict'`
- [x] 2.2 Make `reloadTransaction` in `src/editor/reload.ts` use the line diff (one change per hunk, each narrowed with `minimalReplacement`, still `'rebuild'` on a separator change). Verify that the existing `reload.test.ts` tests pass unchanged, plus a new test where a reload touches two distant places and a cursor between them keeps its exact position

## 3. Incoming-lines highlight

- [x] 3.1 Add `src/editor/incoming.ts`: a `StateField` of inserted ranges tagged `persistent` or `fading`, mapped through changes (collapsed ranges dropped), with `addIncoming` / `clearIncoming(kind)` effects, providing `cm-incoming` / `cm-incoming-fading` line decorations for every line a range touches. Have `mergeChanges` and `reloadTransaction` attach `addIncoming` with the inserted ranges of their changes. Verify with unit tests: merged lines are decorated and others are not; two merges accumulate; undoing a merge leaves no decorated line; a deletion-only change adds nothing; `clearIncoming('persistent')` leaves fading ranges alone
- [x] 3.2 Add the ViewPlugin that clears `fading` ranges about 1.5 s after they appear, register the extension in `editorExtensions()` in `src/editor/setup.ts`, and style it in `EditorView.theme` (inset box-shadow tint plus a left accent bar, with a transition) using new light and dark tokens in `src/styles.css`. Verify with `pnpm check` and an e2e screenshot of a highlighted paragraph and a highlighted fenced-code line, in light and dark

## 4. Wiring in `main.ts`

- [x] 4.1 In `applyDisk()`, try `mergeChanges` before `showConflict()` when the buffer has unsaved changes. On success set `saved` to the disk content before dispatching, then set `disk`, clear `external`, hide the bar and show the notice "Merged changes from disk". Clear persistent highlights in `adopt()`. Verify with e2e tests in `e2e/file-sync.spec.ts` (via `simulateExternalChange` and `settled()`): a change on a distant line merges with no bar, the document stays unsaved, and the notice shows; a change on the same line or the next one shows the bar and leaves the text untouched; an identical change on both sides merges once; undo removes only the merged change and leaves the document unsaved; saving after a merge writes exactly the editor's text
- [x] 4.2 Pass `{ fromSave: true }` from `writeTo()` so a merge found on save shows "Merged changes from disk. Review and save again." and writes nothing, and clear persistent highlights after a successful write. Verify with e2e tests: an unnoticed (`notify: false`) mergeable change plus save leaves the disk with the other program's content, the document merged and unsaved, and that notice; a second save writes the merged text; an unnoticed overlapping change plus save still shows the conflict bar
- [x] 4.3 Verify with e2e tests the conflict-bar interplay: with the bar up, a further external change that no longer touches the user's lines merges and hides the bar; *Reload from disk* reloads with a fading highlight; the existing conflict, keep-mine and deleted-file tests still pass
- [x] 4.4 Verify the highlight lifetime with e2e tests: merged lines carry `cm-incoming` while the user types elsewhere and lose it after saving; after an automatic reload the changed lines carry it and lose it within a few seconds; with *View → Line Breaks → Join*, a merged line inside a joined paragraph is still visibly highlighted (if not, apply the fallback in design.md decision 5 risk and re-verify)

## 5. Documentation

- [x] 5.1 Add to *Unreleased* in `CHANGELOG.md` (*Added*: changes on other lines are merged automatically and highlighted; *Changed*: the conflict bar appears only when both sides changed the same or neighbouring lines, and saving merges an unnoticed change instead of stopping), update the *Safe next to other programs* bullet in `README.md` *Features*, remove the *Automatic conflict resolution* item from *Later* in `ROADMAP.md`, and add `linediff.ts`, `merge.ts` and `incoming.ts` to the structure in `AGENTS.md`. Verify the files read correctly and the paths mentioned exist

## 6. Integration and manual checks

- [x] 6.1 Run `pnpm check` and `pnpm e2e` and verify both pass; review the highlight and notice screenshots in `screenshots/`
- [x] 6.2 Manual test in the native app (`pnpm app`), reporting each result to the user: with unsaved edits, have Claude Code or another editor change a different section of the open file (merge, highlight, notice); change the same paragraph (conflict bar); `git checkout` of the file with unrelated unsaved edits; save, then check the file on disk with `git diff`

## 7. Explaining merged lines

- [x] 7.1 Add a `title` attribute to the highlighted line decorations in `src/editor/incoming.ts` ("Merged from disk" for persistent, "Reloaded from disk" for fading). Verify with a unit test in `incoming.test.ts` that reads the attribute for each kind
- [x] 7.2 Add a `merged` kind to `src/bar.ts` (message saying changes from disk were merged and are highlighted, plus a *Clear highlight* button that does not take focus) with green colors matching the highlight in `src/styles.css`. Verify with `pnpm check`
- [x] 7.3 In `src/main.ts`, add `showMerged()` and use it in place of the merge notice and wherever a decision leaves no other bar (merge, *Keep mine*, conflict bar going away); hide the bar when the highlight goes (*Clear highlight*, undo of the merge in `onDocChange`; `adopt()` and a successful write already hide it); keep a notice only for a save that finds nothing new to merge. Verify with e2e tests in `e2e/file-sync.spec.ts`, updating the merge tests that expected the notice: the bar appears after a merge (also one found by a save) and typing still goes to the editor; *Clear highlight* removes highlight and bar, keeps the text and the unsaved state; saving or undoing the merge removes both; a conflict replaces the bar and *Keep mine* brings it back; reloads show no bar; highlighted lines carry the tooltip
- [x] 7.4 Update the screenshot test of merged lines so it also shows the bar, in light and dark, and review the images in `screenshots/`
- [x] 7.5 Update the *Unreleased* entry in `CHANGELOG.md` and the *Safe next to other programs* bullet in `README.md` to mention the bar and *Clear highlight*. Verify the files read correctly
- [x] 7.6 Run `pnpm check` and `pnpm e2e` and verify both pass; manual check in the native app (`pnpm app`), reported to the user: the bar after a merge, *Clear highlight*, and the tooltip shown by WebKit when resting the pointer on a highlighted line

## Workflow follow-up

- Archive the change with `/opsx:archive` once implemented and manually verified.
