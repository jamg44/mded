# Design

## Context

See proposal.md for the motivation. The pieces involved today:

- `softbreaks.ts` is a `StateField` that replaces each soft line break of a paragraph with a space widget and makes it atomic. `setup.ts` puts it in a `Compartment` (`softBreaks`), and `main.ts` reconfigures it from the `breaks` preference.
- `hybrid.ts` builds decorations in a `ViewPlugin`. It reveals markers where the selection touches (`touches`, `lineActive`). It rebuilds only on doc, viewport, selection or syntax tree changes. Its `CheckboxWidget` toggles `[ ]`/`[x]` with a direct `view.dispatch`.
- `incoming.ts` reads `state.field(joinSoftBreaks, false)` to put the highlight on the first line of a joined paragraph.
- `main.ts` keeps document state. Reloads and merges from disk change the document with `view.dispatch`, or with `view.setState` when the line separator changes. Opening a file or creating a new one calls `load()`, which builds a fresh state with `newState()`.
- Menus: `tauri.ts` builds the native menu (`radioGroup` for View options). `web.ts` has no menu: it maps Cmd/Ctrl shortcuts to actions in a capturing `keydown` listener.
- CodeMirror's `EditorState.readOnly` is already respected by its own input paths: typing (DOM changes are reverted), paste, cut, drop, and the history commands `undo`/`redo`. It does **not** stop transactions dispatched by code.

## Goals / Non-Goals

**Goals:**
- One switch, in `setup.ts`, decides the whole editor configuration for a mode. Nothing else has to remember which mode is on to stay correct.
- Changes from disk keep working untouched in Reading Mode.

**Non-Goals:**
- Styling Reading Mode differently beyond the indicators in §7 (no background tint or different typography).
- A separate rendering pipeline for Reading Mode: it is the same hybrid decorations with nothing revealed.

## Decisions

### 1. A mode compartment: readOnly + a `readingMode` facet + optional joining

Replace the `softBreaks` compartment with a `mode` compartment. Its content:

```
edit mode      -> []
reading mode   -> [ EditorState.readOnly.of(true),
                    readingMode.of(true),            // new facet, default false
                    EditorView.editorAttributes.of({ class: 'cm-reading' }),
                    join ? joinSoftBreaks : [] ]
```

`setReadingMode(view, { reading, join })` reconfigures it, and `EditorOptions` gets `reading` and `readingJoin` so `newState()` builds a state that already has the current mode.

- **Why a facet besides `readOnly`:** "do not reveal markers" is a reading concern, not a consequence of being read-only. A future read-only case (e.g. a file without write permission) should not hide markers by accident. Code that needs to know the mode reads `readingMode`, not `readOnly`.
- **Why `readOnly` and not `EditorView.editable.of(false)`:** with `readOnly`, the caret, arrow keys, keyboard selection and copy keep working, and the caret stays where the user was reading when they go back to editing. CodeMirror also already blocks typing, paste, cut, drop and undo/redo with it, so we don't have to block each path ourselves.
- **Why joining inside the same compartment:** it makes it impossible to join lines in edit mode. `incoming.ts` keeps working unchanged: `state.field(joinSoftBreaks, false)` is simply undefined unless reading with joining on.
- Alternative considered: keep the `softBreaks` compartment and add a second one for reading. Rejected: two switches that must agree is how edit mode ended up joining lines.

### 2. Hybrid mode reads the facet

`buildDecorations` reads `state.facet(readingMode)`. When it is true, `touches` always returns false, so nothing is revealed or dimmed because of the caret. The `ViewPlugin` must also rebuild when the facet changes between `startState` and `state`, because a reconfiguration is none of the changes it watches today.

The checkbox widget checks `view.state.readOnly` in its `mousedown` handler and does nothing (it still calls `preventDefault`). That check is needed because its toggle is a direct `dispatch`, which `readOnly` does not stop. In this case the guard is about modifying the text, so `readOnly` is the right flag to check. `.cm-reading .cm-md-checkbox` gets `cursor: default` so it doesn't look clickable.

### 3. Notice on attempted edits: `beforeinput`

A `domEventHandlers` entry for `beforeinput` calls an `onReadOnlyInput` callback from `EditorOptions` when `state.readOnly` is true. `main.ts` answers with `bar.notice('Reading Mode: press ⌘E to edit')` (Ctrl+E outside macOS). It doesn't handle the event: CodeMirror still discards the input.

- **Why `beforeinput`:** the content stays `contenteditable` with `readOnly`, so the browser fires `beforeinput` for every attempt to change the text: typing, Enter, delete, paste, cut and drop. It doesn't fire for caret movement or copy, so the spec's "no notice when moving the caret" comes for free.
- Alternative considered: `keydown` with a printable-key check. Rejected: it misses paste and drop and needs a hand-made list of keys.
- Undo/redo from the native menu don't go through the DOM. `actions.undo`/`redo` show the same notice when Reading Mode is on (the command already returns false).
- Repeated attempts just restart the notice: `bar.notice` already resets its timers.

### 4. Keeping the place when switching

Before reconfiguring, `main.ts` takes the line block at the top of the scroller (`lineBlockAtHeight` for the document-relative top of the window) and how far the window's top is into it. It dispatches the reconfiguration together with `EditorView.scrollIntoView(block.from, { y: 'start', yMargin })`. The selection is untouched by a reconfiguration, so the caret stays where it was.

- **`yMargin` is not just minus the offset.** `scrollIntoView` aligns the line's text, which sits a few pixels (about 4) inside its block, so using only the offset makes the window drift by that gap on every switch. The gap is measured (`coordsAtPos(block.from)` against the block's top) and added to the margin.
- **Why not set `scrollTop` by hand after the new layout:** tried first (`requestMeasure` reading the line's new top). It is exact when heights don't change, but with joining on the document gets much shorter and CodeMirror's own scroll correction in the same update undoes it: the window jumps to the top. `scrollIntoView` goes through that correction.
- With joining on, the anchor may be a line in the middle of a joined paragraph. The paragraph's visual line goes to the top, which is the closest equivalent.
- Alternative considered: restoring `scrollTop` as a number. Rejected: joining changes heights, so the same number points elsewhere.

### 5. Mode state and menus

- `main.ts` holds `let reading = false`. It is not saved: the app always starts in edit mode. `actions.toggleReading()` flips it, applies it with the scroll anchoring and keeps the focus in the editor. `actions.newFile()` turns it off before `load('')`. Opening a file keeps it.
- `Actions` gains `toggleReading()` and `setReadingJoin(on: boolean)`. `setBreaks` and `BreaksPref` go away.
- `Platform` gains `setReadingMode(on: boolean)`, so the native check mark follows changes that don't come from the menu (New turning it off). It also enables *Join Lines When Reading* only while reading: the option keeps its check but is greyed out in edit mode, where it has no effect (the first manual test found a checked option that looked broken). `web.ts` implements it as a no-op.
- `tauri.ts`: under *View*, a `CheckMenuItem` "Reading Mode" with accelerator `CmdOrCtrl+E`, a separator, and a `CheckMenuItem` "Join Lines When Reading". The *Line Breaks* submenu goes away. Clicking a `CheckMenuItem` flips its check natively, so the actions set it explicitly to the real state afterwards, as `radioGroup` does.
- Cmd+E has no CodeMirror binding, so the accelerator works on every platform. Unlike undo/redo, no editor keymap entry is needed.
- `web.ts`: `e` → `toggleReading` in the existing shortcut map, so e2e tests can use the real shortcut. *Join Lines When Reading* has no shortcut: e2e sets it through the stored preferences, as the theme tests do.

### 7. Showing the mode: pill, title, no caret

Added after the first manual test: with nothing on screen, Reading Mode was only noticed when typing failed.

- **Pill:** a `<button id="reading-pill">` in `index.html`, inside a wrapper positioned over `#editor` (top right), so it sits below the file bar when that is shown and never collides with the notice at the bottom right. It is shown while reading. `tabindex="-1"` and `mousedown` → `preventDefault` keep the focus in the editor, as the bar's buttons do. A click calls `toggleReading`. Its `title` says how to edit with the keyboard. It needs a `z-index` above the `body::before` strip, like the bar.
- **Title:** `updateTitle()` adds ` (Reading)` after the file name. `toggleReading` calls it.
- **No caret:** theme rules on `&.cm-reading` hide `.cm-cursorLayer` and make the native caret transparent. The selection stays: arrow keys still move an invisible caret, Shift+arrows select visibly, and the caret reappears where it was when editing again.
- **Theme scoping:** `.cm-reading` is on the editor's root element, the same one that carries the theme class, so editor theme rules must use `&.cm-reading …`. A plain `.cm-reading …` selector becomes a descendant selector that never matches. This was the bug in the checkbox `cursor: default` rule from §2.

### 8. Arrows scroll while reading

Added after the second manual test: with no visible caret, Up and Down moving an invisible caret felt broken; a reader scrolls. The reading extension includes a `Prec.highest` keymap that binds `ArrowUp`/`ArrowDown` to `scrollDOM.scrollBy` by `view.defaultLineHeight` and returns true, so CodeMirror's caret motion never runs. `Shift-ArrowUp`/`Shift-ArrowDown` are different bindings and still extend the selection. Being part of the mode compartment, the keymap is gone in edit mode. Left/Right still move the (invisible) caret; nothing depends on that.

### 6. Preference

`prefs.ts`: `readingJoin: boolean` (default `false`) replaces `breaks`. `loadPrefs` drops a leftover `breaks` key, so `savePrefs` stops writing it back. There is no migration: the old value means something different now.

## Risks / Trade-offs

- [WebKit's `beforeinput` while `readOnly` might differ from Chromium's (e.g. dictation, IME composition)] → e2e covers Chromium. Check typing, paste and dictation by hand in the installed app.
- [Native Cut/Paste menu items in Reading Mode] → they go through the webview's cut/paste events, which CodeMirror discards when `readOnly`. Can't be tested from the browser: manual check.
- [Users who relied on joining while editing lose it] → Accepted: that's the source of the bug. Joining stays available in Reading Mode.
- [Code that dispatches is not stopped by `readOnly`] → Only reloads and merges from disk (wanted) and the checkbox (guarded) dispatch today. Anything new that edits text from a widget or a command must check `readOnly`. Add this to AGENTS.md *Known pitfalls*.
- [A caret inside a joined line break's indentation is drawn at the edge of the space widget] → Cosmetic, only in Reading Mode with joining on. It doesn't change the text.

## Migration Plan

No data migration. The stored `breaks` value is dropped on load. Rollback is reverting the change. A stored `readingJoin` is ignored by older builds, which fall back to their `breaks` default.

## Open Questions

- Cmd+E is macOS's "Use Selection for Find". Search and replace (on the roadmap) may want it later. It can be remapped then without changing this design.
