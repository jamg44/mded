# Design

## Context

See proposal.md for motivation and scope, and `specs/search/spec.md` for the behavior. What shapes the approach:

- The editor loads only `defaultKeymap`, `historyKeymap` and `indentWithTab` (`setup.ts`). `@codemirror/search` is not installed, so what this document says about its API comes from its documentation and has to be confirmed against the installed version in the first task.
- Hybrid mode decides what to hide in one pure function, `buildDecorations(state, tree, visible, opts)` in `hybrid.ts`. An element shows its markers when `touches(from, to)` finds a selection range on it, and never while `readingMode` is on. Decorations are built only for the visible ranges.
- Reading Mode is `EditorState.readOnly` plus the `readingMode` facet, swapped as one extension in the `mode` compartment. `readOnly` does not stop code that dispatches by itself (AGENTS.md pitfall).
- On macOS a menu accelerator catches the key before the webview. Undo and Redo already use that pattern: accelerator on macOS, CodeMirror's keymap elsewhere and in the browser build.
- Layout: `#bar` sits above `<main id="editor">`; the Reading pill is absolutely positioned at the top right of `<main>`; the notice is fixed at the bottom right. CodeMirror panels render inside `.cm-editor`, above or below the scroller.
- Cmd+E is Reading Mode, so macOS's "Use Selection for Find" (also Cmd+E) is not offered.

**Checked against `@codemirror/search` 6.7.2 (task 1.1).** What the design assumed holds, with these details:

- `search({ top: true })`, `searchPanelOpen(state)`, `getSearchQuery(state)` (with `.valid`) and `SearchQuery.getCursor(state, from, to)` are public. The counter and the reveal ranges are built on `getCursor`, and use the condition the library's own highlighter uses: panel open and query valid.
- There is no match counter, so decision 10 stands.
- The panel builds its replace row only if `state.readOnly` is false when it is created, and never revisits it (decision 7). `replaceNext` and `replaceAll` return false on a read-only state. `replaceAll` is one `dispatch`, hence one undo step.
- `searchKeymap` binds `Mod-g` once, with `shift` as the previous-match handler, so Shift-Mod-g needs no separate entry.
- The panel's *all* button is `button[name=select]`, the replace field is `input[name=replace]`, and the search field carries a `main-field` attribute.
- **Opening the panel with text selected (up to 100 characters) fills the search field with it.** Cmd+F therefore already covers the common case of "Use Selection for Find"; what is still missing is the dedicated command (see ROADMAP).
- A replacement is dispatched as a plain string insert, which CodeMirror splits on the state's line separator. Whether that is right for `\r\n` documents is the subject of task 4.2.

## Goals / Non-Goals

**Goals:**

- Reuse CodeMirror's search engine and panel as they are; write only what mded needs on top (revealing markers, panel placement, menu wiring, styling).
- Keep the "what is hidden" decision in the one pure function that already owns it, so the new rule is unit-testable.
- No new way of changing text: replacements are CodeMirror transactions, like typing.

**Non-Goals:**

- A second search engine over rendered text (the deferred Reading Mode search).
- A custom panel. If the default one later proves limiting, `search({ createPanel })` swaps the UI and keeps everything else in this design.
- Search history, go to line, selecting all matches as multiple selections, "Use Selection for Find".

## Decisions

### 1. `@codemirror/search` with its default panel, in a new `src/editor/search.ts`

`search.ts` owns everything search-related and is the only module that imports `@codemirror/search`, apart from `hybrid.ts` asking it for ranges (decision 4): the `search({ top: true })` configuration, the keymap, the commands `main.ts` calls, and the panel-height bookkeeping (decision 6).

*Alternative: a custom bar over the same engine.* Rejected for now: the default panel already has find, replace and the three options, and the user reviewed it and found it good enough. A custom bar was only worth it to leave replace out, which is no longer a goal.

### 2. An explicit keymap, not `searchKeymap`

`searchKeymap` also binds select-all-matches (Mod-Shift-L), select-next-occurrence (Mod-D) and go-to-line (Mod-Alt-G). None of them is in scope, and the first two need multiple selections, which the editor does not enable. The keymap binds only:

| Key | Command | Scope |
|---|---|---|
| Mod-f | open the panel, focus the search field | editor, search panel |
| Mod-g / Shift-Mod-g | next / previous match | editor, search panel |
| Mod-Alt-f | open the panel, focus the replace field (no-op while `readOnly`) | editor, search panel |
| Escape | close the panel | editor, search panel |

Enter and Shift+Enter in the search field are handled by the panel itself.

For the same reason the panel's *all* button (select all matches) is hidden with a theme rule: without multiple selections it would collapse to a single selection and look broken.

### 3. Menu items call actions; accelerators only on macOS

`Actions` gains `find()`, `findNext()`, `findPrevious()` and `replace()`, implemented in `main.ts` by calling the commands exported from `search.ts` on the view. `platform/tauri.ts` adds four items to *Edit*, with accelerators on macOS only, exactly as Undo/Redo do; elsewhere the keymap of decision 2 handles the keys. `platform/web.ts` needs no change: its capture-phase handler ignores these keys and the keymap gets them.

`Platform.setReadingMode(on)` already exists to keep the *View* menu right. It also disables *Find and Replace…* while reading, so no new platform method is needed.

### 4. Matches reveal markers through `buildDecorations`

`buildDecorations` gets one more input: `opts.reveal`, a list of `{ from, to }` ranges. The `ViewPlugin` in `hybrid.ts` fills it by asking `search.ts` for the matches of the current query inside the visible ranges, and only while the panel is open and the query is valid, which is the same condition CodeMirror uses to highlight. With the panel closed the list is empty and nothing changes.

The plugin must also rebuild when the query or the panel's open state changes, in addition to its current triggers (document, viewport, selection, mode, tree).

Keeping it a plain parameter keeps `buildDecorations` pure: unit tests pass ranges directly and never need a search state.

*Alternative: put a selection range on every match.* Rejected: it would change the user's selection and needs multiple selections.

*Alternative: reveal every element that contains a match.* Rejected: searching for an ordinary word would reveal the markers of every bold or link it appears in, moving text for no reason. Markers appear only when the match is on something the user cannot see.

### 5. The rule: a match on hidden text reveals the whole element

An element is revealed by a match when the match overlaps (shares at least one character with) a range that element would hide or replace. The whole element then behaves as if the caret were in it, so both `**` of a bold show, not just the one that matched. Concretely, next to each existing `touches(...)` / `lineActive(...)` check:

- Inline elements (`Emphasis`, `StrongEmphasis`, `Strikethrough`, `InlineCode`, `Link`, headings): revealed if a match overlaps any of their marker children (`EmphasisMark`, `StrikethroughMark`, `CodeMark`, `LinkMark`, `URL`, `LinkTitle`, `HeaderMark`).
- `Image`: revealed if a match overlaps any part of it, since all of its markdown is replaced by the picture.
- Single-range markers (`QuoteMark`, bullet `ListMark`, `TaskMarker`, `HorizontalRule`, `Escape`): revealed if a match overlaps that marker's own range.

Overlap is strict (`match.from < range.to && match.to > range.from`), unlike `touches`, which is inclusive so that a caret at the edge of an element counts. A match that merely ends where a marker begins has nothing hidden in it.

This check ignores `readingMode`: the reveal applies while reading too, which is the one exception the `reading-mode` delta adds. The caret rule keeps its `!reading` guard.

### 6. Panel on top, with the scroll compensated

`search({ top: true })` puts the panel in the flow above the scroller, which shrinks the scroller from the top and pushes the text down by the panel's height. To keep the text still, the scroll offset is moved by the same amount when the panel appears or goes away:

- The rule follows the panel's *height*, not just open and close, so a rebuild (decision 7) or the panel wrapping onto a second row when the window narrows is compensated by the difference. When the height grows by `d`: `scrollTop += d`, except when the first line of the document is in view, where nothing is added and the text moves down with the panel. When it shrinks by `d`: `scrollTop = max(0, scrollTop - d)`. The shrink rule does not depend on what was compensated on open, so scrolling with the panel open and then closing it also keeps the text still.
- The compensation runs in a `requestMeasure` write, which is CodeMirror's measure step: after the panel's DOM is in place and before the browser paints that frame.

**Spike result (task 1.2).** In Chromium the text stays within half a pixel (the panel's height is fractional and `scrollTop` is rounded) when the panel opens and closes halfway down a 300-paragraph document, and at the start of the document the first line ends up below the panel. The browser's layout-shift report names only the scroller's own box as having moved, never a line of text, so there is no painted frame with the text displaced. CodeMirror did not undo the manual `scrollTop` (the problem documented in `applyReading()` in `main.ts` comes from the document's height changing, which does not happen here). WebKit is still to be checked by hand (task 6.3).

The same hook publishes the panel's height as a CSS custom property on `<main id="editor">` (`--search-panel-height`, `0px` when closed), and `.reading-pill` adds it to its `top`. That keeps the pill below the panel without `styles.css` knowing anything about CodeMirror's class names.

Being in the flow (not floating) means CodeMirror already knows the panel is there when it scrolls a match into view, so matches never end up underneath it.

*Alternative: a floating panel over the text.* Rejected: at the start of the document it covers the first lines with no way to scroll them out from under it.

*Fallback: panel at the bottom* (`top: false`). No text movement, no compensation, no pill offset. Agreed with the user as the plan if the spike fails; taking it means updating the specs first (see Risks).

### 7. Rebuilding the panel when the mode changes

CodeMirror's panel decides whether to include the replace row when it is created, from `state.readOnly`, and does not revisit it. When `applyReading` runs with the panel open, it closes the panel, switches the mode and opens a new one (`rebuildingPanel` in `search.ts`), all before the browser paints. `applyReading()` ends with `view.focus()`, so the focus goes to the text, the same as any other mode switch.

**The query does not survive on its own.** It lives in the editor state, but `openSearchPanel` fills the search field from the selection when something is selected (up to 100 characters), and after stepping to a match the selection *is* the match. A regular expression such as `Para\w+ 1\b` would silently become `Paragraph 1`. `rebuildingPanel` therefore puts the query back with `setSearchQuery` right after opening. An e2e test fails without that line.

**The panel's height changes with the row, and that moves the text.** The compensation of decision 6 runs in a measure write, but CodeMirror applies a pending scroll target after the writes, and `applyReading` always has one (it anchors the line at the top of the window). The panel's compensation was overridden, and the text moved by the height of the replace row. So when the panel is open, `applyReading` does the mode switch and rebuild first, measures how much the panel's height changed, and then anchors the top line with `yMargin` reduced by `scrollShift(view, delta)`, the same rule the plugin uses, so there is one definition of how far the scroll position follows the panel.

### 8. Replace relies on CodeMirror's commands, verified rather than trusted

The replace commands are expected to (a) refuse when `state.readOnly`, (b) dispatch *replace all* as one transaction, hence one undo step, and (c) change only the matched ranges. All three are checked by unit tests in this change instead of assumed, because AGENTS.md is explicit that `readOnly` does not stop code that dispatches.

Line endings were the one place where trusting the library was not enough, and the check found a real problem. `createState` sets `EditorState.lineSeparator` to `\r\n` for files that use it, and CodeMirror splits inserted text on that separator only. A `\n` typed in the replace field (the library turns the typed escape `\n` into a line feed, with or without the regular-expression option) therefore stayed inside the line as an ordinary character, and saving wrote a lone line feed into a CRLF file: mixed line endings.

The fix is a transaction filter in `search.ts`, limited to replace operations (`input.replace`, `input.replace.all`) in documents that have a custom line separator. It rewrites stray `\r` and `\n` in the inserted text as the document's separator. The correction is a second change set composed onto the library's, from the document the library produced to the right one, so the selection that *replace* sets on the next match is carried through it and the whole stays one transaction, one undo step. Replacements without line breaks, and documents with plain line feeds, are untouched. Pasting text with a bare line feed into a CRLF document has the same problem, but it is outside this change and is not affected by it.

### 9. Styling in the editor theme

The panel's rules (`.cm-panels`, `.cm-search`, `.cm-textfield`, `.cm-button`, `.cm-searchMatch`, `.cm-searchMatch-selected`) go in `EditorView.theme` in `setup.ts`, using the color tokens from `styles.css`, because CodeMirror's base theme would win over `styles.css` (AGENTS.md pitfall). The panel's content is aligned to the text column (`--content-width`) so it does not stretch across a wide window.

### 10. The match counter is added to the default panel

CodeMirror's panel has no counter (task 1.1 confirms it for the installed version; if it has one, use it and drop this decision). A small `ViewPlugin` in `search.ts` provides it while the panel is open:

- **Counting** is a pure function, `countMatches(state)`: it walks the query's cursor over the whole document and returns the total and the index of the match that equals the main selection, if any. It is recomputed when the document, the query or the panel's open state changes; a selection change alone only needs the index, but recounting is simple and correct, so optimize only if it shows.
- **A cap** keeps a pathological search (one letter in a huge file, a slow regular expression) from blocking typing: counting stops at 9999 and the panel shows "9999+". Past the cap the position is not shown.
- **Rendering:** the plugin puts one `<span class="cm-search-count" aria-live="polite">` right after the search field and sets its text ("3 of 7", "7 matches", "No matches", or empty for an empty or invalid query). It is an inline block with a minimum width, so the buttons after it do not move when the text comes and goes. Because the panel is rebuilt on a mode switch (decision 7), the plugin puts the span back whenever the current panel does not have it.

*Alternative: a custom panel via `search({ createPanel })`.* Rejected: it means rewriting the fields, buttons, options and their keyboard handling to add one label.

*Alternative: count only the matches in view.* Rejected: "2 of 2" with more matches further down is worse than no counter.

### 11. The panel is CodeMirror's, rearranged a little

After trying it, the user asked for three things the default panel does not do: previous and next as arrows, the counter next to the search field, and the replace row out of the way until it is wanted. They are done on the default panel, by the same plugin that adds the counter (`panelExtras`), not with a custom one:

- **Arrows.** The theme gives the buttons' words no size and draws `↑` / `↓` in a `::before`. The plugin puts *previous* before *next* (the order in VS Code, which the user took as the reference) and gives each an `aria-label` and a `title`, because a screen reader would otherwise read the arrow out.
- **Replace on request.** CodeMirror's panel always builds the replace row while editing, so it is only hidden: a `StateField` (`replaceShown`) puts the class `cm-replace-shown` on the editor through `editorAttributes`, and the theme hides the row without it. Using the editor's attributes, not a class the plugin sets on the panel, means the row is already right when CodeMirror measures the panel's height in the same update, so the compensation of decision 6 needs nothing but one more trigger (the field changing).
- **The arrow that shows it** is a button the plugin prepends to the panel, absolutely positioned in the panel's left padding so the fields of both rows line up. It keeps the focus where it was (`mousedown` is prevented), and when hiding the row would hide the focused control, the focus goes to the search field first.
- **When it is shown.** `openFind` on a closed panel resets the field to hidden; on an open panel it leaves it alone. `openReplace` sets it. Being editor state, it survives the panel being rebuilt on a mode switch, so the row comes back after a visit to Reading Mode, where there is no replace field and so no arrow.

*Alternative: a custom panel (`search({ createPanel })`).* With three changes instead of one it is closer than it was in decision 10, and it would also remove the rebuild on mode switch. Still rejected: it means owning the fields, the options, their commit logic and their keyboard handling (about twice the code), to end with the same panel. If a fourth change of this kind comes, that is the point to switch.

### 12. Hybrid decorations at the lowest precedence

Found by the user: searching for `si` over inline code such as `` `00-vision-sistema.md` `` showed gaps after each match and no highlight. Marks from different sources nest by precedence, and the search highlighter (`Prec.low` inside the library, not configurable) ended up *around* hybrid mode's marks. A match inside inline code therefore cut the `cm-md-code` span into pieces, each with its own padding (the gaps) and its own background painted over the highlight.

`hybridMarkdown` is now loaded with `Prec.lowest`, so the highlight is drawn inside the styled span, which stays one element. Nothing else depended on the order: the full unit and e2e suites pass unchanged.

## Risks / Trade-offs

- [The arrows, the counter's place and the hidden row all depend on the structure of a panel CodeMirror owns] → Each has an e2e test that fails if the library changes that structure; decision 11 says when to stop patching and write a custom panel.

- [Appending a node to a panel CodeMirror owns breaks if the library changes the panel's structure] → The span is appended to the panel's root element, the only thing relied on; an e2e test reads the counter, so a library update that breaks it fails the suite.
- [Counting the whole document on every keystroke is slow on large files] → Capped at 9999 matches (decision 10); if typing still lags on real documents, debounce the count.

- [The scroll compensation flickers or is undone by CodeMirror] → It is task 1.2, before anything is built on it. If it cannot be made clean, stop, tell the user, and switch to the bottom panel: the spec's *The panel does not move the text* and *The panel does not cover the Reading pill* requirements and the "at the top of the editor" scenario are then rewritten before continuing.
- [WebKit scrolls differently from Playwright's Chromium] → e2e proves the logic; the native app gets an explicit manual check for the jump.
- [Markers appearing while the user types a query move the text] → Only happens when the query matches hidden text, and only for those elements (decision 4, second alternative). Accepted.
- [A regular expression that is slow on a large document] → Both CodeMirror's highlighting and the reveal ranges only scan the visible ranges. Stepping to the next match scans further, as in any CodeMirror editor. Accepted.
- [In Reading Mode `**` matches today and will not once the rendered search arrives] → A rare search; noted in the ROADMAP item for the deferred work.
- [The library's behavior differs from what this design assumes] → Task 1.1 confirms the API (panel options, `readOnly` handling, exported commands and query accessors) against the installed version before the rest is built.
- [Native menu items and accelerators can't be tested from the browser] → Listed as manual checks in the last task group.
