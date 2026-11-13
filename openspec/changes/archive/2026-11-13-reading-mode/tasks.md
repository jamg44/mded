# Tasks

## 1. Mode compartment in the editor

- [x] 1.1 Add the `readingMode` facet (default `false`) and the reading extension builder (`readOnly`, the facet, the `cm-reading` editor class, and `joinSoftBreaks` only when joining) in a new `src/editor/reading.ts`; verify with `pnpm check` (tsc)
- [x] 1.2 In `setup.ts`, replace the `softBreaks` compartment and `setJoinSoftBreaks` with a `mode` compartment and `setReadingMode(view, { reading, join })`, and replace `EditorOptions.joinSoftBreaks` with `reading` and `readingJoin`; verify with unit tests in `src/editor/reading.test.ts`: an edit-mode state is not read-only and has no `joinSoftBreaks` field, even with `readingJoin: true`; a reading state is read-only, has the facet on, and has the field only with `readingJoin: true`
- [x] 1.3 Add the `beforeinput` handler that calls `EditorOptions.onReadOnlyInput` only while `state.readOnly`; verify with `pnpm check` (behavior covered by e2e in 3.6)
- [x] 1.4 Update `incoming.test.ts` ("mark the first line of a joined paragraph") to build its states with `reading: true, readingJoin: true` / `reading: true, readingJoin: false`; verify that `pnpm test` passes
- [x] 1.5 Update AGENTS.md: `softbreaks.ts` and the new `reading.ts` in *Structure*, the joined-paragraph pitfall now says it only happens in Reading Mode, and a new pitfall: `readOnly` does not stop code that dispatches (widgets and commands that edit text must check `state.readOnly`); verify by reading the diff

## 2. Hybrid decorations in Reading Mode

- [x] 2.1 In `hybrid.ts`, make `touches` return false when `state.facet(readingMode)` is on, and rebuild the `ViewPlugin` decorations when the facet changes between `startState` and `state`; verify with unit tests in `hybrid.test.ts`: with the caret on a heading, on bold text, on a task line and on a list item, Reading Mode hides the markers that edit mode reveals
- [x] 2.2 Make the checkbox widget's `mousedown` do nothing when `view.state.readOnly` (keep `preventDefault`), and add `cursor: default` for `.cm-reading .cm-md-checkbox` in `setup.ts`'s theme; verify with the e2e test in 3.6

## 3. Mode switch, preference and menus

- [x] 3.1 In `prefs.ts`, replace `breaks`/`BreaksPref`/`BREAKS_OPTIONS` with `readingJoin: boolean` (default `false`), and drop a stored `breaks` key in `loadPrefs`; verify with a unit test in `src/prefs.test.ts` (stored `{"breaks":"join"}` loads as `readingJoin: false` with no `breaks` key) and update the `prefs.ts` line in AGENTS.md *Structure*
- [x] 3.2 In `platform/types.ts`, replace `setBreaks` with `toggleReading()` and `setReadingJoin(on)` in `Actions`, and add `setReadingMode(on)` to `Platform`; verify with `pnpm check`
- [x] 3.3 In `main.ts`, keep `reading` (not persisted) and pass `reading`/`readingJoin`/`onReadOnlyInput` to `newState()`; implement `toggleReading` with the scroll anchoring from design.md §4 (top line block plus offset, `scrollIntoView` with `y: 'start'` in the same dispatch) and keep the focus in the editor; `newFile` turns Reading Mode off and calls `platform.setReadingMode(false)`; `setReadingJoin` saves the preference and reconfigures; `undo`/`redo` and `onReadOnlyInput` show the notice "Reading Mode: press ⌘E to edit" (Ctrl+E outside macOS) while reading; verify with the e2e tests in 3.6
- [x] 3.4 In `platform/tauri.ts`, replace the *Line Breaks* submenu with `CheckMenuItem`s "Reading Mode" (`CmdOrCtrl+E`) and "Join Lines When Reading", setting each check to the real state after the action, and implement `setReadingMode`; verify with `pnpm check` and the manual checks in 4.3
- [x] 3.5 In `platform/web.ts`, map Cmd/Ctrl+E to `toggleReading` and add a no-op `setReadingMode`; verify with the e2e tests in 3.6
- [x] 3.6 Add `e2e/reading-mode.spec.ts` covering the `reading-mode` spec scenarios: edit mode keeps line breaks (Enter at the end of a paragraph and typing, typing on the blank line between paragraphs, Enter mid-line), Cmd+E on and off, no markers revealed at the caret, typing/Enter/Backspace/paste/cut leave the text unchanged and the title clean, undo does nothing, copy gives the markdown, checkbox click does nothing, notice on typing and none on arrow keys, caret and top line kept when switching (with and without joining), opening a file keeps the mode and New turns it off, joining off by default and on via stored `readingJoin`, hard breaks kept, external change reloaded and highlighted while reading (including a joined paragraph); save screenshots of Reading Mode with and without joining; verify that `pnpm e2e` passes
- [x] 3.7 Update the existing e2e tests that assume joining while editing: `editor.spec.ts` "visually joins the lines of a paragraph…" and `file-sync.spec.ts` "mark a line of a joined paragraph" now turn on Reading Mode with `readingJoin` stored (the latter merges while reading); verify that `pnpm e2e` passes
- [x] 3.8 Update user docs: CHANGELOG *Unreleased* (Added: Reading Mode with Cmd+E and *Join Lines When Reading*; Changed: editing always shows line breaks as in the file, which fixes new lines jumping into the paragraph above; Removed: *View → Line Breaks*), README features (the *Reflowed paragraphs* bullet becomes Reading Mode) and file list (`reading.ts`), ROADMAP (note next to *Source mode* that it completes Source ↔ Hybrid ↔ Reading); verify by reading the diff

## 5. Showing the mode

- [x] 5.1 Fix the theme selector for the checkbox to `&.cm-reading .cm-md-checkbox`, and hide the caret in Reading Mode (`&.cm-reading .cm-cursorLayer`, transparent native caret); verify with e2e: the checkbox's computed cursor is `default` while reading, and no `.cm-cursor` is visible while reading but one is after switching back
- [x] 5.2 Add the "Reading" pill (`index.html`, `styles.css` with tokens for light and dark, shown from `main.ts`, click → `toggleReading` without taking focus) and the " (Reading)" title suffix in `updateTitle()`; verify with e2e covering the spec's *Reading Mode is visible* scenarios (pill and title on and off, dirty title, clicking the pill returns to editing and typing goes into the text) and a screenshot of the pill in light and dark
- [x] 5.3 In `platform/tauri.ts`, create *Join Lines When Reading* disabled and make `setReadingMode` enable it only while reading; verify with `pnpm check` and the manual check in 4.3
- [x] 5.5 In `reading.ts`, add a highest-precedence keymap: `ArrowUp`/`ArrowDown` scroll by `view.defaultLineHeight` without moving the selection; verify with e2e: Down scrolls by about one line and leaves the selection head unchanged, Up scrolls back, and after switching to editing Down moves the caret again
- [x] 5.4 Update CHANGELOG *Unreleased* (Reading Mode entry mentions the pill, the title and the hidden caret; the join option is available while reading) and README; verify by reading the diff

## 4. Integration checks

- [x] 4.1 Run `pnpm check` and verify it passes with no Biome or tsc errors
- [x] 4.2 Run `pnpm e2e` and review the Reading Mode screenshots in `screenshots/`
- [x] 4.3 Ask the user to check by hand in the native app (`pnpm app`): *View → Reading Mode* check mark and Cmd+E; the check mark clears after File → New; *Join Lines When Reading* persists after relaunch; the app starts in edit mode; Edit → Cut/Paste and Cmd+Z do nothing in Reading Mode; typing and dictation in WebKit show the notice and change nothing; the pill and "(Reading)" title show while reading and the pill returns to editing; *Join Lines When Reading* is greyed out (keeping its check) while editing and enabled while reading
