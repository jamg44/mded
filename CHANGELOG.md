# Changelog

All notable changes to mded are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and mded follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-13

### Added

- **Reading Mode.** *View → Reading Mode* (Cmd+E) shows the document rendered and protects it from stray key presses: nothing you type, paste, cut or drop changes the text, task checkboxes can't be ticked, and markers stay hidden. You can still select and copy, and the Up and Down arrows scroll the page. You can tell you are reading: a *Reading* pill sits in the top right corner (click it to go back to editing), the window title says *(Reading)*, and there is no text cursor. If you try to type, a brief notice tells you to press Cmd+E. Going back to editing keeps your cursor and your place in the document. The app always starts in editing mode.
- **Join Lines When Reading.** A *View* option, off by default, that makes the lines of a hard-wrapped paragraph read as one paragraph while you are in Reading Mode. The file keeps its line breaks. It can be changed while reading; while editing it is greyed out, since it has no effect there.

### Changed

- **Editing always shows the file's line breaks as they are.** Before, with *Join Paragraphs* on, pressing Enter at the end of a paragraph, or typing on the blank line between two paragraphs, made the new line jump up and join the paragraph above while you typed. Joining lines now only happens in Reading Mode.

### Removed

- ***View → Line Breaks*** (*Join Paragraphs* / *As in File*). Its job is split: editing always shows lines as in the file, and *Join Lines When Reading* covers the other case. Your old choice is not carried over.

## [0.3.0] - 2026-11-08

### Added

- **Changes made elsewhere in the file are merged for you.** If another program changes the open file while you have unsaved changes, mded no longer makes you pick one version: when the changes are on different lines it adds theirs to your text, keeps yours exactly as typed, and tells you. Cmd+Z takes the merged changes away and leaves your own.
- **You can see what came in from disk.** The lines that were merged are highlighted until you save, so you can review them, and a bar at the top explains the highlight. *Clear highlight* removes it when you are done reviewing. Resting the pointer on a highlighted line also says where it came from. After a reload, the changed lines are highlighted briefly and fade out.

### Changed

- **The warning bar appears only when both sides changed the same lines, or lines next to each other.** In that case nothing is merged and you still choose between *Reload from disk* and *Keep mine*.
- **Saving when the file changed in a way that can be merged** merges it and asks you to save again, instead of stopping with the bar. It still never writes a version of the file you have not seen.

## [0.2.0] - 2026-11-08

### Added

- **Changes made by other programs are picked up.** If another program changes the open file (another editor, git, a sync client, an AI agent), mded reloads it while you look at it, keeping your cursor and scroll position, and Cmd+Z brings back the previous text. If you have unsaved changes, a warning bar lets you choose between *Reload from disk* and *Keep mine*. It never takes the keyboard, so a stray key press cannot answer it.
- **Saving never overwrites a version of the file you have not seen.** Before writing, mded checks that the file still holds what it last read or wrote; if not, it does not save and shows the change instead.
- **Deleted or moved files keep your text.** mded tells you the file is gone, and saving creates it again.

### Fixed

- macOS smart quotes, smart dashes and spelling autocorrection no longer rewrite what you type: `--` stays `--` and `"` stays `"`, so thematic breaks, frontmatter fences and code are not silently broken.

## 0.1.0 - 2026-11-07

First version.

- Hybrid live preview: headings, emphasis, strikethrough, inline code, links, blockquotes, lists, horizontal rules and fenced code blocks with syntax highlighting. Markers stay hidden until the cursor enters their element.
- Clickable task lists that change only `[ ]` to `[x]`.
- Inline images, including paths relative to the file.
- Hard-wrapped paragraphs read as one paragraph while the file keeps its line breaks (*View → Line Breaks*).
- Cmd+click opens links in the browser.
- Light, dark or system theme, and *Readable*, *Wide* or *Full* text width.
- macOS integration: Finder's *Open With*, files dropped on the window, reopening the last file, and a warning before discarding unsaved changes.
- The file is saved exactly as written: nothing rewrites or normalizes the markdown.

[Unreleased]: https://github.com/jamg44/mded/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jamg44/mded/releases/tag/v0.4.0
[0.3.0]: https://github.com/jamg44/mded/releases/tag/v0.3.0
[0.2.0]: https://github.com/jamg44/mded/releases/tag/v0.2.0
