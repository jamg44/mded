## Why

On macOS, WebKit applies the system's "smart" text substitutions to whatever is typed in the editor. `--` becomes `—` and `"` becomes `“`, so a `---` rule, a frontmatter fence or a code snippet is silently corrupted. Automatic spelling correction can also rewrite words, including identifiers inside code. This breaks mded's core promise that the file contains exactly what the user typed. The bug was found while writing ROADMAP.md in mded. A manual spike, setting WebKit's defaults keys to `false`, confirmed the fix: `--` and `"` stay plain ASCII.

## What Changes

- On macOS, at startup and before the webview is created, mded registers app-level defaults that turn off three WebKit text substitutions:
  - automatic quote substitution
  - automatic dash substitution
  - automatic spelling correction
- These defaults are registered in memory and never persisted. A value the user sets explicitly for the app still takes precedence.
- **Text replacement** (the user's own shortcuts from System Settings) is kept on purpose.
- Spell-check underlining is out of scope. Manual testing showed it doesn't work today: WebKit keeps continuous spell checking off unless the app enables it. It goes to the roadmap.
- The editor's `autocorrect` content attribute is set to `off`, to match.
- Windows and Linux are unchanged: their webviews don't do these substitutions.
- ROADMAP.md:
  - the item is removed from *Now*
  - "spelling autocorrect done right" (e.g. never inside code) is added to *Later*

## Capabilities

### New Capabilities

- `text-input`: typed text reaches the document as typed. Which automatic text transformations the editor allows or blocks while the user types.

### Modified Capabilities

None. There are no existing specs.

## Impact

- `src-tauri/src/lib.rs`: a macOS-only startup step, before `tauri::Builder` builds the window.
- `src-tauri/Cargo.toml`: `objc2-foundation` becomes a direct dependency, for macOS targets only. It is already in the dependency tree through Tauri and wry.
- `src/editor/setup.ts`: the `autocorrect` content attribute.
- `ROADMAP.md`.
- Testing: e2e can't cover this, because Playwright's Chromium has no macOS substitutions. It is verified manually in the installed app.
