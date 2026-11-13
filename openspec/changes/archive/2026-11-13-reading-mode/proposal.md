# Proposal

## Why

With *Join Paragraphs* on (today's default), editing fights the display. Press Enter at the end of a paragraph and start typing, or type on the blank line between two paragraphs, and the new line jumps up and joins the paragraph above. Markdown reads it as a continuation of that paragraph, and `softbreaks.ts` shows the line break as a space. Pressing Enter in the middle of a line seems to do nothing for the same reason. Joining lines is a reading view: it is useful for hard-wrapped files, and it gets in the way when writing. Editors like Obsidian keep lines as they are while editing and only reflow when reading.

## What Changes

- **BREAKING (behavior):** while editing, single line breaks inside a paragraph are always shown as they are in the file. The editor no longer joins lines visually in edit mode.
- **New Reading Mode**, toggled with *View → Reading Mode* (Cmd+E):
  - The document is shown rendered: markdown markers are never revealed at the cursor.
  - Nothing modifies the text: typing, pasting, cutting, deleting, dropping, undo/redo and clicking task checkboxes do nothing.
  - The caret, arrow keys, selection and copy still work. Going back to editing keeps the cursor where the user was reading.
  - Trying to type shows a brief notice explaining how to go back to editing.
  - Switching modes keeps the reading position.
  - Changes made on disk keep being reloaded or merged as in edit mode.
- **Joining lines becomes a Reading Mode option:** *View → Join Lines When Reading*, a checkbox that is off by default.
- **BREAKING (preference):** the `breaks: 'join' | 'keep'` preference is replaced by `readingJoin: boolean` (default `false`). The *View → Line Breaks* submenu goes away. The stored value is not migrated, which is acceptable with a single user today.
- The app always starts in edit mode. Reading Mode is not remembered between launches.
- Out of scope: double-click to edit at that point, opening links with a plain click in Reading Mode, Source mode (still on the roadmap).

## Capabilities

### New Capabilities
- `reading-mode`: how the document is shown and protected while reading versus editing: which line breaks are shown as in the file, how Reading Mode is entered and left, what it blocks, and the join-lines option.

### Modified Capabilities
<!-- None: file-sync and text-input requirements do not change. Reading Mode only has to keep file-sync working, which is stated in the new spec. -->

## Impact

- `src/editor/`: new Reading Mode extension (read-only state, a facet that tells hybrid mode not to reveal markers, soft-break joining when enabled); `setup.ts` replaces the soft-breaks compartment; `hybrid.ts` stops revealing markers and stops the checkbox toggle in Reading Mode; `incoming.ts` keeps its joined-paragraph handling, now reached only in Reading Mode.
- `src/main.ts`: Reading Mode state, toggle action with scroll anchoring, notice when the user tries to type.
- `src/prefs.ts`, `src/platform/types.ts`, `src/platform/tauri.ts`, `src/platform/web.ts`: new preference, actions and menu items; Cmd+E shortcut in the browser build.
- Tests: unit tests for the decorations in Reading Mode; e2e tests that assume joining while editing (`editor.spec.ts`, `file-sync.spec.ts`) move to Reading Mode with joining on; new e2e tests for Reading Mode.
- Docs: `CHANGELOG.md`, `README.md`, `AGENTS.md`, `ROADMAP.md`.
- Native menu and accelerator need manual testing in the app.
