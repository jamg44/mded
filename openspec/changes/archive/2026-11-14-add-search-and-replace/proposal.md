# Proposal

## Why

mded has no way to find text in a document: Cmd+F does nothing, and the only alternative is to leave the app. It is the most widely expected feature the editor lacks, and the only one on the roadmap whose absence has no workaround. Replacing comes with it at little extra cost, since the same panel and engine provide both.

## What Changes

- **Find.** Cmd+F (Ctrl+F outside macOS) opens a search panel at the top of the editor. Matches are highlighted, and the user steps through them with Enter / Shift+Enter in the panel, Cmd+G / Cmd+Shift+G anywhere, or the panel's up and down arrows. Escape closes the panel and returns to the text.
- **Search runs over the text of the file**, not over what is rendered, in both edit mode and Reading Mode. `**` can be searched for; `is important` does not match `is **important**`.
- **Match counter.** Right after the search field, the panel shows how many matches the document has and which one is selected ("3 of 7").
- **Options:** match case, whole word and regular expression, as offered by the panel.
- **Replace.** The panel has a replace field with *replace* and *replace all*, shown on request: Cmd+F opens the panel to search only, and an arrow at its left, or *Find and Replace…*, shows the replace row. A replacement changes only the characters of the matches, *replace all* is a single undo step, and the file's line endings are left alone.
- **A match is always visible.** When a match falls on text that hybrid mode hides (a marker, a link's URL, an image's source), the element it belongs to shows its markers for as long as the search is open, the same way it does when the caret enters it. This also applies in Reading Mode.
- **Reading Mode can search but not replace.** The panel opens without the replace controls, and *Edit → Find and Replace…* is disabled while reading.
- **The panel does not move the text.** Opening or closing it keeps the text where it was on screen, except at the start of the document, where the text moves down so the panel does not cover the first lines.
- **Edit menu:** *Find…*, *Find Next*, *Find Previous* and *Find and Replace…*.

Out of scope, and noted in ROADMAP.md under *Later*: searching Reading Mode over what is rendered (format markers never match, hidden content such as a link's URL does). Also out of scope: "Use Selection for Find" (its macOS shortcut, Cmd+E, is Reading Mode; noted in ROADMAP.md under *Later*), multiple selections from the matches, go to line, and search history.

## Capabilities

### New Capabilities

- `search`: finding and replacing text in the open document: how the panel is opened and closed, what text is searched, how matches are shown and stepped through, what replacing changes, and how search behaves in Reading Mode.

### Modified Capabilities

- `reading-mode`: the requirement *Reading Mode does not reveal markers* gains one exception: while a search is open, an element whose hidden text holds a match shows its markers.

## Impact

- **New dependency:** `@codemirror/search` (same family and version line as the CodeMirror packages already in use).
- **Editor:** a new `src/editor/search.ts` (search configuration, keys, panel placement, the match counter and the ranges that matches reveal); `hybrid.ts` takes those ranges into account when deciding what to hide; `setup.ts` loads the extension and styles the panel in the editor theme.
- **App:** `main.ts` gains the find and replace actions and rebuilds the panel when the mode changes; `styles.css` moves the Reading pill below the panel while it is open.
- **Platform:** `Actions` gains `find`, `findNext`, `findPrevious` and `replace`; `platform/tauri.ts` adds the Edit menu items and disables *Find and Replace…* while reading. `platform/web.ts` needs no new shortcuts, since CodeMirror's keymap handles them in the browser.
- **No Rust changes** and no new Tauri permissions.
- **Fidelity:** replacing is the first feature that changes several places of the text at once. It goes through CodeMirror transactions like typing does, so saving (`sliceDoc`) and the disk baseline checks are unaffected.
- **Verification:** behavior is covered by unit tests and `pnpm e2e`. The Edit menu items and their accelerators are native and need a manual check.
- **Docs:** CHANGELOG *Unreleased*, README features, AGENTS.md structure and pitfalls, ROADMAP (*Now* item leaves).
