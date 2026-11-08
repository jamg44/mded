# Spec Delta

## Purpose

Keeps the open document consistent with its file on disk: external changes are detected and shown, and saving never overwrites a version of the file that the user has not seen.

## ADDED Requirements

### Requirement: Save does not overwrite external changes
The editor SHALL write the file on save only if its content on disk is identical to the content the editor last read from or wrote to it. Otherwise it MUST NOT write the file, and MUST handle the difference like any external change: with unsaved changes, keep the document unsaved and show the conflict warning; without them, reload the file.

#### Scenario: Disk unchanged since it was read
- **WHEN** the user saves and the file on disk has not changed since the editor last read or wrote it
- **THEN** the file is written with exactly the editor's text

#### Scenario: Disk changed by another program
- **GIVEN** the document has unsaved changes, and the file was changed on disk by another program after the editor last read or wrote it, without the editor noticing
- **WHEN** the user saves
- **THEN** the file on disk keeps the other program's content, the document stays unsaved, and the conflict warning is shown

#### Scenario: Disk changed and nothing to lose
- **GIVEN** the document has no unsaved changes, and the file was changed on disk by another program without the editor noticing
- **WHEN** the user saves
- **THEN** the file on disk keeps the other program's content, and the editor shows that content as saved

#### Scenario: Saving right after own save
- **WHEN** the user saves twice in a row with an edit in between, and no other program touched the file
- **THEN** both saves write the file and no conflict warning is shown

### Requirement: External changes are detected while the file is open
The editor SHALL detect changes made by other programs to the open file while the editor is running, including while its window is in front, and SHALL also check the file when the window regains focus. A change is a difference in content; a change in modification time alone MUST NOT count as one.

#### Scenario: Another program edits the open file
- **WHEN** another program writes new content to the open file while the editor window is in front
- **THEN** the editor reacts to the change within about a second, without any user action

#### Scenario: Atomic save by another editor
- **WHEN** another program replaces the file by writing a temporary file and renaming it over the original
- **THEN** the editor detects the change, and keeps detecting later changes to the same path

#### Scenario: File touched without changing content
- **WHEN** another program updates the file's modification time but leaves its content identical
- **THEN** the editor does nothing visible

#### Scenario: Untitled document
- **WHEN** the document has never been saved
- **THEN** no file is watched and no external-change behavior applies

### Requirement: Clean document reloads automatically
When an external change is detected and the document has no unsaved changes, the editor SHALL replace its text with the new content on disk without asking, keep the cursor and scroll position as close as possible to where they were, and keep the document saved.

#### Scenario: External edit to a clean document
- **WHEN** the document has no unsaved changes and another program changes a paragraph of the file
- **THEN** the editor shows the new content, the document is still marked as saved, and the cursor stays at the same place in unchanged text

#### Scenario: Undo after an automatic reload
- **WHEN** the document was reloaded automatically and the user undoes
- **THEN** the editor shows the text from before the reload, and the document is marked as unsaved

### Requirement: Automatic reload shows a discreet notice
After an automatic reload, the editor SHALL show a brief, non-blocking notice saying the file was reloaded from disk. The notice MUST disappear on its own after a few seconds and MUST NOT take keyboard focus.

#### Scenario: Notice after reload
- **WHEN** the editor reloads the document automatically
- **THEN** a notice saying it was reloaded from disk appears, typing continues to go to the editor, and the notice disappears after a few seconds

### Requirement: Conflicting changes show a warning bar
When the file changes on disk and the document has unsaved changes, the editor SHALL keep the user's text and show a persistent, non-modal warning bar with two actions: *Reload from disk* and *Keep mine*. The bar MUST NOT take keyboard focus, MUST NOT be dismissible without choosing an action, and MUST NOT be activated by typing.

#### Scenario: External edit while the user has unsaved changes
- **WHEN** the document has unsaved changes and another program changes the file
- **THEN** the user's text is unchanged, the warning bar appears, and keys typed afterwards go to the editor

#### Scenario: Conflict resolves by itself
- **WHEN** the warning bar is shown and the user edits the document until its text is identical to the file on disk
- **THEN** the warning bar disappears and the document is marked as saved

### Requirement: Reload from disk replaces the text undoably
Choosing *Reload from disk* SHALL replace the document's text with the file's content on disk at the moment of the choice, mark the document as saved, and hide the warning bar. The replaced text MUST remain reachable with undo.

#### Scenario: User reloads during a conflict
- **WHEN** the user chooses *Reload from disk*
- **THEN** the editor shows the current content of the file on disk, the document is marked as saved, and the bar disappears

#### Scenario: User recovers their text after reloading
- **WHEN** the user chose *Reload from disk* and then undoes
- **THEN** the editor shows the user's previous text, marked as unsaved

### Requirement: Keep mine accepts overwriting the external version
Choosing *Keep mine* SHALL leave the document's text unchanged, hide the warning bar, and treat the file's content on disk at the moment of the choice as seen by the user, so that the next save writes the file without a conflict.

#### Scenario: User keeps their version and saves
- **WHEN** the user chooses *Keep mine* and then saves, and the file has not changed again
- **THEN** the file is written with the editor's text

#### Scenario: File changes again after Keep mine
- **WHEN** the user chose *Keep mine* and another program changes the file again before the user saves
- **THEN** the warning bar appears again

### Requirement: Deleted or moved file keeps the document
When the open file no longer exists at its path, the editor SHALL keep the document's text, mark it as unsaved, and show a non-modal informational bar saying the file no longer exists on disk and that saving will recreate it. Saving SHALL recreate the file at the same path.

#### Scenario: File deleted by another program
- **WHEN** another program deletes the open file
- **THEN** the text stays in the editor, the document is marked as unsaved, and the informational bar is shown

#### Scenario: Saving a deleted file
- **WHEN** the informational bar is shown and the user saves
- **THEN** the file is created at the same path with exactly the editor's text, and the bar disappears

#### Scenario: File comes back
- **WHEN** the informational bar is shown and the file reappears at the same path
- **THEN** the bar disappears and the editor reacts as to any other external change

### Requirement: Reload preserves fidelity
Reloading from disk SHALL make the document's text identical to the file's content, including line endings. Saving immediately after a reload MUST write back exactly the bytes that were read.

#### Scenario: Reload of a CRLF file
- **WHEN** another program changes a file that uses `\r\n` line endings and the editor reloads it
- **THEN** saving without edits writes a file identical to the one on disk, with `\r\n` line endings

#### Scenario: Line endings changed externally
- **WHEN** another program converts the open file from `\n` to `\r\n` line endings and the editor reloads it
- **THEN** the document uses `\r\n` from then on, and saving writes `\r\n` line endings
