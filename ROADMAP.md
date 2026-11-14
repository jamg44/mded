# Roadmap

Where mded is heading. There are no dates: it moves at the pace of daily use, and items are noted along the way. Finished items leave this file and show up under *Features* in the [README](README.md).

Ideas and bug reports are welcome as issues, but read *Not planned* first.

## Now

## Next

- Known bugs:
    - Selecting text over inline code (for example `` `00-vision-sistema-agentes-sdlc.md` ``) does not show the selection shading on it.
    - Text with lone line feeds inserted into a file that uses Windows line endings (CRLF) keeps them as they are, so the file is saved with mixed line endings. Confirmed for text inserted through the editor's own API, which is how a paste arrives; pasting has not been checked by hand yet. Search and replace is not affected: it already writes the file's own line endings.
- Multiple windows: one document per window, so opening a second file no longer replaces the first (drag and drop of several files opens several windows)
- Format hotkeys
- Window remembers last size and position (tauri-plugin-window-state)
- Table rendering
- Numbered lists. Also check that Enter in an ordered list doesn't renumber the following items, which would change text the user didn't touch.
- Source mode: toggle hybrid rendering off. It completes the scale Source ↔ Hybrid ↔ Reading (Reading Mode already exists)
- Reference links and images: `[text][ref]`

## Later

Ideas that fit the project, in no particular order.

- Search in Reading Mode over what is rendered: hidden format markers don't match, hidden content (a link's URL) does and marks its element. Until then search matches the file's text in both modes, so `**` is found while reading and `is important` does not match `is **important**`.
- Use Selection for Find as its own command. Cmd+F already fills the search with the selected text when it opens the panel; what is missing is the macOS command that does it without moving the focus to the panel. Its shortcut, Cmd+E, is taken by Reading Mode, so it needs a decision on the keys.
- A settings window (Cmd+,). Until then, preferences live in the *View* menu.
- Reopen recent files
- Spelling autocorrect done right (e.g. never inside code)
- Spell-check underline (WebKit keeps continuous spell checking off unless the app enables it)
- Frontmatter YAML (`---` at the top)
- Decide on a UI framework (Svelte 5, as planned in AGENTS.md) before adding the file tree and the bars
- Files and folders section
- Top bar with quick actions and bottom status bar with info and other actions
- HTML rendering. Sanitize it (e.g. DOMPurify or an allowlist of tags): the webview can call the native file commands, so raw HTML from an untrusted file could read or write files on disk.
- Signed, prebuilt binaries, so mded doesn't have to be built from source.
- Tabs?
- Testing and polishing Windows and Linux builds.
- Test writing UX

## Not planned

- **Rewriting or normalizing markdown.** That rules out formatting on save, and tree-based editors that write the document back out from their own model. The file is saved exactly as it was typed.
