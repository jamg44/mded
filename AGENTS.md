# AGENTS.md

Guide for AI agents (and humans) working on **mded**.

## What it is

A native markdown editor with a **hybrid mode**, in the style of Typora or Obsidian's Live Preview: text is shown rendered, and the markers (`#`, `**`, `[]()`…) appear, dimmed, only where the cursor is.

- **Platform:** macOS first. Windows and Linux are desirable but untested.
- **Stack:** Tauri 2 (Rust) + CodeMirror 6 + TypeScript with no UI framework + Vite.
- **Tooling:** pnpm, Node 24 (`.nvmrc`), Rust 1.95 (`src-tauri/rust-toolchain.toml`), Biome, Vitest and Playwright.
- **Language:** UI, code, comments and docs are in English.

## The non-negotiable principle: fidelity

**The file is saved exactly as it is in the editor.** Nothing rewrites or normalizes the user's markdown: not list styles, tables, escapes or line endings. This is why Milkdown (and other tree-based editors) was ruled out.

- Everything "WYSIWYG" is a **view decoration**. The text never changes because of how it is displayed.
- Save with `state.sliceDoc()`, never `doc.toString()`. `toString()` always joins with `\n` and would lose `\r\n`.
- If you add a feature that modifies text (e.g. ticking a checkbox), change only the minimum characters.

## Commands

| Command | What it does |
|---|---|
| `pnpm app` | App in development mode. Changes in `src/` reload automatically; changes in `src-tauri/` rebuild and restart. In VS Code: **Cmd+Shift+B** |
| `pnpm app:install` | Release build → `/Applications/mded.app` → LaunchServices registration. **Writes to /Applications: ask for confirmation before running it** |
| `pnpm app:build` | Release build (`.app` + `.dmg`) in `src-tauri/target/release/bundle/` |
| `pnpm web` | The editor in a browser (`localhost:1430`) with in-memory files |
| `pnpm check` | `tsc` + Biome + unit tests. **Must pass before anything is considered done** |
| `pnpm e2e` | Playwright tests against `pnpm web`. Saves screenshots to `screenshots/` |
| `pnpm fix` | Formats and applies Biome fixes |
| `cd src-tauri && cargo clippy` | Rust lint (no warnings) |
| `cd src-tauri && cargo test` | Rust tests: the file watcher against the real filesystem (about 5 s) |

## Structure

```
src/
  main.ts            document state (path, unsaved changes, what the disk held) and actions; keeps the file and the editor in sync
  prefs.ts           preferences (theme, width, join lines when reading, last file) in localStorage
  paths.ts           path helpers without Node
  bar.ts             the bar above the editor (file conflict, file deleted) and the "Reloaded from disk" notice
  styles.css         color tokens (light/dark), hybrid mode styles, bar and notice
  editor/
    setup.ts         CodeMirror extensions and theme (EditorView.theme)
    hybrid.ts        hybrid mode: ViewPlugin, syntax tree → decorations
    reading.ts       Reading Mode: read-only, no markers revealed at the caret, optional joining of lines (one extension swapped as a whole)
    softbreaks.ts    visually joins single line breaks inside a paragraph, only in Reading Mode (StateField)
    reload.ts        minimal replacement between the document and the new file content, line by line (reload keeps cursor, scroll and undo)
    linediff.ts      pure line diff (Myers); a line includes its separator
    merge.ts         three-way merge by lines: the other side's changes applied to the document (all or nothing)
    incoming.ts      highlight of the lines that came from disk after a merge or reload (StateField)
    search.ts        search and replace: CodeMirror's panel and engine with the app's keys, the panel kept from moving the text, and the match counter
  platform/
    types.ts         Platform interface: everything that depends on the environment
    tauri.ts         native implementation: menus, dialogs, invoke
    web.ts           browser implementation with in-memory files (pnpm web, e2e)
src-tauri/
  src/lib.rs         read_file / read_file_if_exists / write_file / initial_files / watch_file commands and the macOS Opened event
  tauri.conf.json    window, .md file association, asset protocol
  capabilities/      frontend permissions: when using a new Tauri API, add its permission here
e2e/                 Playwright tests
examples/            test documents (Biome leaves them alone)
openspec/            specs and change proposals (OpenSpec)
ROADMAP.md           what's next and what's not planned: check it before proposing features
```

**Nothing outside `src/platform/` imports `@tauri-apps/*`.** That way the same editor runs in a browser and can be tested without the native app.

## Verifying changes

1. **Hybrid mode logic:** unit tests in `src/editor/*.test.ts`. They build an `EditorState`, call the pure function (`buildDecorations`, `softBreakRanges`) and check what is hidden, dimmed or turned into a widget.
2. **Behavior and look:** `pnpm e2e`. To see the result, open the screenshots in `screenshots/`.
3. **The file watcher:** `cd src-tauri && cargo test` covers it against the real filesystem (in-place writes, atomic replace, delete). In e2e, `__mded.platform.simulateExternalChange(path, contents | null, notify = true)` plays another program editing or deleting the file (`notify: false` is a change the watcher missed), and `__mded.settled()` waits for the editor's queued file checks.
4. **Native features** (menus, dialogs, Finder, title bar) can't be tested from the browser. Say so explicitly and let the user test them.

**Don't launch the user's installed browsers** (Chrome, Brave…), not even headless. Use Playwright's Chromium.

## Known pitfalls

- **CodeMirror styles:** its base styles beat `styles.css` on specificity because they are injected later. Anything that must win over them (font, padding, cursor, selection) goes in `EditorView.theme` in `setup.ts`, without `!important`.
- **Decorations that span line breaks** can't come from a `ViewPlugin`; they must come from a `StateField` (see `softbreaks.ts`).
- **`readOnly` does not stop code that dispatches.** Reading Mode uses `EditorState.readOnly`, which makes CodeMirror discard typing, paste, cut, drop and undo/redo, but a widget or command that calls `view.dispatch` still edits the text. Anything that changes text must check `state.readOnly` (see the checkbox in `hybrid.ts`). Reloads and merges from disk dispatch on purpose and keep working while reading.
- **With soft line breaks joined (Reading Mode only), a paragraph's lines are one `.cm-line`** and CodeMirror only keeps the line decoration of the first one. `incoming.ts` decorates the first line of the group; do the same for any new per-line decoration.
- **Don't dispatch from an update listener.** `onChange` runs inside the update, so `adopt()` (which `onDocChange` can call) defers its dispatch with `queueMicrotask` (`clearMerged` in `main.ts`).
- **CodeMirror only renders what is visible.** In e2e tests, `.cm-line` `.first()` is not the document's first line once the view has scrolled. Use `{ hasText }` and retrying assertions (`toHaveText`, `expect.poll`).
- **Biome 2.x also formats markdown.** `.md` files are excluded in `biome.json`; don't include them again or it will rewrite the test documents.
- **Search matches the file's text, never the rendering.** `**` matches, `is important` does not match `is **important**`. A match on text that hybrid mode hides makes that element show its markers: `buildDecorations` takes `reveal` ranges (the matches of an open search) and every element that hides or replaces text checks `overlaps(...)` for them. A new decoration that hides text must do the same, or a match would be highlighted where nobody can see it.
- **The search panel pushes the text down, and a `scrollIntoView` in the same update wins over the compensation.** `search.ts` scrolls by the panel's height change in a measure write, but CodeMirror applies a pending scroll target *after* the writes. Anything that dispatches a `scrollIntoView` while the panel's height changes must put `scrollShift(view, delta)` in its margin (see `applyReading` in `main.ts`).
- **`openSearchPanel` overwrites the query with the selection** when something is selected, so any code that closes and reopens the panel has to put the query back (`rebuildingPanel`). The panel also decides at creation whether to have a replace field, from `state.readOnly`, which is why it is rebuilt when Reading Mode is toggled.
- **Text inserted by a replace is split only on the document's own line separator.** In a `\r\n` file a stray `\n` would stay inside its line and be saved as a lone line feed; `replaceWithOwnLineBreaks` in `search.ts` rewrites those for replace operations. Anything else that inserts text from a string should be checked the same way.
- **Hybrid mode's decorations are loaded at the lowest precedence** (`Prec.lowest` in `setup.ts`), so that marks from other sources, the search highlight above all, are drawn *inside* a styled span and not around it. Around it, a match inside inline code cut the span into pieces, each with its own padding and with its background over the highlight.
- **The search panel is CodeMirror's own, rearranged by `panelExtras` in `search.ts`** (counter after the field, arrows, the arrow that shows the replace row). The replace row is always in the DOM while editing and hidden by CSS unless the editor has the class `cm-replace-shown`: in tests, check that the controls are *visible*, not that they exist.
- **In e2e tests, type into the search panel instead of using `fill()`:** the panel reads its fields on key up and on change, which `fill()` does not fire (clearing with `fill('')` happens to work).
- **Editing the file from outside:** `watch_file` watches the file's *parent directory* and filters by name. Editors, git and sync tools save by writing a temporary file and renaming it over the original, and a watch on the file itself keeps following the old, unlinked file and goes silent after the first such save. Watcher events are only a hint (they can be duplicated, or caused by our own write): `syncFromDisk()` in `main.ts` always compares the file's *content* with what the disk held when we last read or wrote it, never modification times.
- **Never write the file without that comparison:** `writeTo()` re-reads the file and refuses to write if it differs from the baseline. Anything new that writes to the open file must go through it.
- **macOS delivers "Open With" files before the `Ready` event**, which is when Tauri runs `setup()`. State is registered with `.manage()` on the builder, not in `setup()`.
- **Release builds use `panic = "abort"`:** a failing `unwrap()` closes the app with no message. No `unwrap` in system event callbacks.
- **macOS smart substitutions:** WebKit applies the system's smart quotes, dashes and spelling correction to typed text (`--` → `—`, `"` → `“`) unless the app registers its `WebAutomatic…Enabled` defaults. That is done in `disable_text_substitutions()` in `lib.rs` and can't be tested from the browser (Chromium has no such substitutions): check it by hand in the installed app.
- **Stuck text cursor:** when the mouse leaves the text quickly towards the native title bar, WebKit doesn't restore the arrow. The `body::before` strip in `styles.css` mitigates it.

## Conventions

- Strict TypeScript, no UI framework. If the UI grows a lot (file tree, tabs, settings), the planned option is Svelte 5.
- Comments explain the *why*, not the *what*.
- New preferences go in `prefs.ts` and are exposed in the **View** menu (`radioGroup` in `platform/tauri.ts`). The settings window (Cmd+,) is deliberately postponed.
- Small, easy-to-test changes: the app is used daily and improvements are noted along the way.
- User-visible changes get an entry under *Unreleased* in `CHANGELOG.md` (Keep a Changelog: Added / Changed / Fixed / Removed), written for people using the app. A release moves them under a new version heading, bumps `version` in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, and is tagged `vX.Y.Z`.
