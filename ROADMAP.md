# Roadmap

Where mded is heading. There are no dates: it moves at the pace of daily use, and items are noted along the way. Finished items leave this file and show up under *Features* in the [README](README.md).

Ideas and bug reports are welcome as issues, but read *Not planned* first.

## Now

- Test writing UX

## Next

- Window remembers last size and position (tauri-plugin-window-state)
- Format hotkeys
- Table rendering
- Numbered lists. Also check that Enter in an ordered list doesn't renumber the following items, which would change text the user didn't touch.
- Source mode: toggle hybrid rendering off
- Reference links and images: `[text][ref]`
- Search and replace

## Later

Ideas that fit the project, in no particular order.

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
- Multiple windows? (Drag and drop multiple files opening multiple windows)
- Testing and polishing Windows and Linux builds.

## Not planned

- **Rewriting or normalizing markdown.** That rules out formatting on save, and tree-based editors that write the document back out from their own model. The file is saved exactly as it was typed.
