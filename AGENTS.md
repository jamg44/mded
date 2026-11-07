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

## Structure

```
src/
  main.ts            document state (path, unsaved changes) and actions
  prefs.ts           preferences (theme, width, line breaks, last file) in localStorage
  paths.ts           path helpers without Node
  styles.css         color tokens (light/dark), hybrid mode styles
  editor/
    setup.ts         CodeMirror extensions and theme (EditorView.theme)
    hybrid.ts        hybrid mode: ViewPlugin, syntax tree → decorations
    softbreaks.ts    visually joins single line breaks inside a paragraph (StateField)
  platform/
    types.ts         Platform interface: everything that depends on the environment
    tauri.ts         native implementation: menus, dialogs, invoke
    web.ts           browser implementation with in-memory files (pnpm web, e2e)
src-tauri/
  src/lib.rs         read_file / write_file / initial_files commands and the macOS Opened event
  tauri.conf.json    window, .md file association, asset protocol
  capabilities/      frontend permissions: when using a new Tauri API, add its permission here
e2e/                 Playwright tests
examples/            test documents (Biome leaves them alone)
```

**Nothing outside `src/platform/` imports `@tauri-apps/*`.** That way the same editor runs in a browser and can be tested without the native app.

## Verifying changes

1. **Hybrid mode logic:** unit tests in `src/editor/*.test.ts`. They build an `EditorState`, call the pure function (`buildDecorations`, `softBreakRanges`) and check what is hidden, dimmed or turned into a widget.
2. **Behavior and look:** `pnpm e2e`. To see the result, open the screenshots in `screenshots/`.
3. **Native features** (menus, dialogs, Finder, title bar) can't be tested from the browser. Say so explicitly and let the user test them.

**Don't launch the user's installed browsers** (Chrome, Brave…), not even headless. Use Playwright's Chromium.

## Known pitfalls

- **CodeMirror styles:** its base styles beat `styles.css` on specificity because they are injected later. Anything that must win over them (font, padding, cursor, selection) goes in `EditorView.theme` in `setup.ts`, without `!important`.
- **Decorations that span line breaks** can't come from a `ViewPlugin`; they must come from a `StateField` (see `softbreaks.ts`).
- **CodeMirror only renders what is visible.** In e2e tests, `.cm-line` `.first()` is not the document's first line once the view has scrolled. Use `{ hasText }` and retrying assertions (`toHaveText`, `expect.poll`).
- **Biome 2.x also formats markdown.** `.md` files are excluded in `biome.json`; don't include them again or it will rewrite the test documents.
- **macOS delivers "Open With" files before the `Ready` event**, which is when Tauri runs `setup()`. State is registered with `.manage()` on the builder, not in `setup()`.
- **Release builds use `panic = "abort"`:** a failing `unwrap()` closes the app with no message. No `unwrap` in system event callbacks.
- **Stuck text cursor:** when the mouse leaves the text quickly towards the native title bar, WebKit doesn't restore the arrow. The `body::before` strip in `styles.css` mitigates it.

## Conventions

- Strict TypeScript, no UI framework. If the UI grows a lot (file tree, tabs, settings), the planned option is Svelte 5.
- Comments explain the *why*, not the *what*.
- New preferences go in `prefs.ts` and are exposed in the **View** menu (`radioGroup` in `platform/tauri.ts`). The settings window (Cmd+,) is deliberately postponed.
- Small, easy-to-test changes: the app is used daily and improvements are noted along the way.
