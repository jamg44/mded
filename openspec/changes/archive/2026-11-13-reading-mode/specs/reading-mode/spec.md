# Spec Delta

## Purpose

Separates reading the document from editing it: while editing, the text is laid out line by line as in the file; Reading Mode shows it rendered, optionally reflowed, and protected from accidental changes.

## ADDED Requirements

### Requirement: Editing shows line breaks as in the file
While editing, the editor SHALL show every line break of the file as a line break. A single line break inside a paragraph MUST NOT be shown as a space or joined with the line above or below.

#### Scenario: Hard-wrapped paragraph while editing
- **GIVEN** a paragraph written on three lines separated by single line breaks
- **WHEN** the document is open for editing
- **THEN** the paragraph is shown on three separate lines

#### Scenario: Typing after Enter at the end of a paragraph
- **WHEN** the user presses Enter at the end of a paragraph and types a word
- **THEN** the word stays on its own line below the paragraph, and the caret stays on that line

#### Scenario: Typing on a blank line between paragraphs
- **WHEN** the user types on the blank line that separates two paragraphs
- **THEN** the typed text is shown on its own line, between the two paragraphs

#### Scenario: Enter in the middle of a line
- **WHEN** the user presses Enter in the middle of a line of a paragraph
- **THEN** the text after the caret is shown on a new line

### Requirement: Reading Mode can be turned on and off
The editor SHALL offer a Reading Mode, turned on and off with *View → Reading Mode* and with the keyboard shortcut Cmd+E (Ctrl+E outside macOS). The menu item MUST show whether Reading Mode is on.

#### Scenario: Turning Reading Mode on and off with the shortcut
- **WHEN** the user presses Cmd+E while editing, and then presses it again
- **THEN** the editor switches to Reading Mode, and then back to editing

#### Scenario: Menu reflects the mode
- **WHEN** Reading Mode is turned on with the shortcut
- **THEN** *View → Reading Mode* is shown checked

#### Scenario: Opening another file while reading
- **GIVEN** Reading Mode is on
- **WHEN** the user opens another file
- **THEN** Reading Mode stays on

#### Scenario: New document while reading
- **GIVEN** Reading Mode is on
- **WHEN** the user creates a new document
- **THEN** the editor switches to edit mode, since an empty document is only useful for writing

### Requirement: Reading Mode is visible
While Reading Mode is on, the editor SHALL show that it is: a "Reading" pill over the top right corner of the text, the window title marked "(Reading)", and no caret. Clicking the pill SHALL switch to editing without taking keyboard focus away from the text. None of these MUST show in edit mode.

#### Scenario: Entering Reading Mode
- **WHEN** the user turns Reading Mode on for `example.md`
- **THEN** the "Reading" pill is shown, the window title is `example.md (Reading) — mded`, and no caret is drawn

#### Scenario: Unsaved changes while reading
- **GIVEN** the document has unsaved changes
- **WHEN** the user turns Reading Mode on
- **THEN** the window title is `• example.md (Reading) — mded`

#### Scenario: Clicking the pill
- **GIVEN** Reading Mode is on
- **WHEN** the user clicks the "Reading" pill
- **THEN** the editor switches to editing, the pill goes away, the title loses "(Reading)", the caret is drawn where it was, and typing goes into the text

#### Scenario: Edit mode
- **WHEN** the document is open for editing
- **THEN** no pill is shown and the title has no "(Reading)"

### Requirement: The app starts in edit mode
The editor SHALL start in edit mode every time it is launched, whether Reading Mode was on when it was last closed or not.

#### Scenario: Relaunch after closing in Reading Mode
- **WHEN** the user closes the app while in Reading Mode and opens it again
- **THEN** the document is open for editing

### Requirement: Reading Mode does not reveal markers
In Reading Mode, the editor SHALL show the document rendered wherever the caret or selection is. Markdown markers that edit mode reveals around the caret (such as `#`, `**`, `[]()`, list and task markers) MUST stay hidden or rendered.

#### Scenario: Caret on a heading
- **GIVEN** Reading Mode is on
- **WHEN** the caret is placed on a heading line
- **THEN** the `#` marker is not shown

#### Scenario: Selecting bold text
- **GIVEN** Reading Mode is on
- **WHEN** the user selects a word written as `**bold**`
- **THEN** the `**` markers are not shown

### Requirement: Reading Mode does not modify the document
In Reading Mode, no user input SHALL change the document: typing, Enter, deleting, pasting, cutting, dropping, undo and redo MUST leave the text unchanged. Moving the caret, selecting and copying MUST keep working.

#### Scenario: Typing in Reading Mode
- **GIVEN** Reading Mode is on
- **WHEN** the user types letters, presses Enter and presses Backspace
- **THEN** the document text is unchanged and the document does not become unsaved

#### Scenario: Pasting and cutting in Reading Mode
- **GIVEN** Reading Mode is on and some text is selected
- **WHEN** the user cuts it, or pastes text from the clipboard
- **THEN** the document text is unchanged

#### Scenario: Undo in Reading Mode
- **GIVEN** the document has edits that can be undone, and Reading Mode is on
- **WHEN** the user chooses Undo
- **THEN** the document text is unchanged

#### Scenario: Copying in Reading Mode
- **GIVEN** Reading Mode is on
- **WHEN** the user selects text with the keyboard or the mouse and copies it
- **THEN** the clipboard holds the selected markdown text exactly as in the file

### Requirement: Up and Down arrows scroll in Reading Mode
In Reading Mode, the Up and Down arrow keys SHALL scroll the document by about one line, as in a reader, without moving the selection. With Shift they keep extending the selection.

#### Scenario: Pressing Down
- **GIVEN** Reading Mode is on and the document is longer than the window
- **WHEN** the user presses the Down arrow
- **THEN** the document scrolls down by about one line and the selection does not change

#### Scenario: Back to editing after scrolling with the arrows
- **GIVEN** Reading Mode is on and the user scrolled down with the Down arrow
- **WHEN** the user switches to editing
- **THEN** the caret is where it was before scrolling, and the arrows move it again

### Requirement: Task checkboxes cannot be toggled in Reading Mode
In Reading Mode, clicking a task checkbox SHALL NOT change it or the text behind it.

#### Scenario: Clicking an unchecked task
- **GIVEN** Reading Mode is on and the document contains `- [ ] task`
- **WHEN** the user clicks its checkbox
- **THEN** the text still contains `- [ ] task` and the checkbox stays unchecked

### Requirement: Trying to edit in Reading Mode shows how to edit
When the user tries to change the document in Reading Mode, the editor SHALL show a brief notice that the document is in Reading Mode and how to go back to editing. The notice MUST go away by itself and MUST NOT take keyboard focus.

#### Scenario: Typing a letter
- **GIVEN** Reading Mode is on
- **WHEN** the user types a letter
- **THEN** a notice says that the document is in Reading Mode and that Cmd+E switches to editing

#### Scenario: Moving the caret
- **GIVEN** Reading Mode is on
- **WHEN** the user moves the caret with the arrow keys
- **THEN** no notice is shown

### Requirement: Switching modes keeps the place
Switching between edit mode and Reading Mode SHALL keep the caret and selection where they were, and SHALL keep in view the part of the document that was at the top of the window.

#### Scenario: Back to editing after reading
- **GIVEN** Reading Mode is on and the caret is in a paragraph halfway down a long document
- **WHEN** the user switches to editing
- **THEN** the caret is in the same place, and the paragraph that was at the top of the window is still at the top

#### Scenario: Switching with joined lines
- **GIVEN** *Join Lines When Reading* is on and the window is scrolled halfway down a document with hard-wrapped paragraphs
- **WHEN** the user switches to Reading Mode
- **THEN** the line that was at the top of the window is still at the top

### Requirement: Joining lines is a Reading Mode option
The editor SHALL offer *View → Join Lines When Reading*, off by default, remembered between launches, and enabled in the menu only while Reading Mode is on. When it is on, Reading Mode SHALL show each single line break inside a paragraph as a space, except hard breaks (two trailing spaces or a trailing backslash). The file MUST keep its line breaks, and edit mode MUST NOT be affected.

#### Scenario: Default
- **WHEN** the app runs for the first time and Reading Mode is turned on
- **THEN** a hard-wrapped paragraph is shown on its separate lines

#### Scenario: Joined paragraph
- **GIVEN** *Join Lines When Reading* is on
- **WHEN** Reading Mode is on and the document has a paragraph written on three lines
- **THEN** the paragraph is shown as one reflowed paragraph, and the text still contains the two line breaks

#### Scenario: Hard break kept
- **GIVEN** *Join Lines When Reading* is on and Reading Mode is on
- **WHEN** a line of a paragraph ends with two spaces
- **THEN** the next line is still shown on a line of its own

#### Scenario: Option does not change edit mode
- **GIVEN** *Join Lines When Reading* is on
- **WHEN** the user switches to editing
- **THEN** every line break is shown as in the file

#### Scenario: Menu item outside Reading Mode
- **GIVEN** *Join Lines When Reading* is on
- **WHEN** the document is open for editing
- **THEN** the menu item is shown disabled and still checked, and it becomes enabled when Reading Mode is turned on

#### Scenario: Option remembered
- **WHEN** the user turns *Join Lines When Reading* on and relaunches the app
- **THEN** the option is still on

### Requirement: Changes on disk keep being applied in Reading Mode
In Reading Mode, the editor SHALL handle changes made to the file by other programs exactly as in edit mode: reload when there are no unsaved changes, merge or show the conflict warning when there are, and highlight the lines that came from disk.

#### Scenario: External edit while reading
- **GIVEN** Reading Mode is on and the document has no unsaved changes
- **WHEN** another program changes a line of the file
- **THEN** the document shows the new content and the changed line is highlighted, while Reading Mode stays on

#### Scenario: Highlight in a joined paragraph
- **GIVEN** *Join Lines When Reading* is on, Reading Mode is on, and a paragraph is shown joined from three lines
- **WHEN** another program changes the second of those lines
- **THEN** the joined paragraph is highlighted

#### Scenario: Conflict bar buttons in Reading Mode
- **GIVEN** Reading Mode is on and the conflict warning is shown
- **WHEN** the user clicks *Reload from disk*
- **THEN** the document is replaced by the file's content
