# file-sync Specification

## Purpose
Keeps the open document consistent with its file on disk: external changes are detected and shown, and saving never overwrites a version of the file that the user has not seen.

## Requirements
### Requirement: Save does not overwrite external changes
The editor SHALL write the file on save only if its content on disk is identical to the content the editor last read from or wrote to it. Otherwise it MUST NOT write the file, and MUST handle the difference like any external change: with unsaved changes, merge the change from disk when possible and otherwise keep the document unsaved and show the conflict warning; without them, reload the file.

#### Scenario: Disk unchanged since it was read
- **WHEN** the user saves and the file on disk has not changed since the editor last read or wrote it
- **THEN** the file is written with exactly the editor's text

#### Scenario: Disk changed by another program
- **GIVEN** the document has unsaved changes, and the file was changed on disk by another program after the editor last read or wrote it, without the editor noticing, on lines that overlap or touch the user's changes
- **WHEN** the user saves
- **THEN** the file on disk keeps the other program's content, the document stays unsaved, and the conflict warning is shown

#### Scenario: Disk changed on other lines
- **GIVEN** the document has unsaved changes, and the file was changed on disk by another program without the editor noticing, on lines that neither overlap nor touch the user's changes
- **WHEN** the user saves
- **THEN** the file on disk keeps the other program's content, the change is merged into the document, the document stays unsaved, and the informational bar for merged changes is shown

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
When the file changes on disk, the document has unsaved changes, and the change cannot be merged because lines changed on disk overlap or touch lines changed in the document, the editor SHALL keep the user's text unchanged and show a persistent, non-modal warning bar with two actions: *Reload from disk* and *Keep mine*. The bar MUST NOT take keyboard focus, MUST NOT be dismissible without choosing an action, and MUST NOT be activated by typing.

#### Scenario: External edit while the user has unsaved changes
- **WHEN** the document has unsaved changes and another program changes a line the user also changed
- **THEN** the user's text is unchanged, nothing from disk is merged, the warning bar appears, and keys typed afterwards go to the editor

#### Scenario: Adjacent lines conflict
- **WHEN** the document has unsaved changes on one line and another program changes the line right after it
- **THEN** nothing from disk is merged and the warning bar appears

#### Scenario: Conflict resolves by itself
- **WHEN** the warning bar is shown and the user edits the document until its text is identical to the file on disk
- **THEN** the warning bar disappears and the document is marked as saved

#### Scenario: Later change on disk merges cleanly
- **GIVEN** the warning bar is shown
- **WHEN** another program changes the file again so that its changes no longer overlap or touch the user's changes
- **THEN** the change is merged, the warning bar disappears, and the document stays unsaved

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

### Requirement: Non-overlapping external changes merge automatically
When the file changes on disk and the document has unsaved changes, the editor SHALL combine both, line by line, using the content it last read from or wrote to the file as the common base, provided no lines changed on disk overlap or touch lines changed in the document. The user's text MUST stay as typed, and the document MUST stay unsaved.

#### Scenario: Changes on different lines
- **GIVEN** the document has unsaved changes on one line
- **WHEN** another program changes a different, non-adjacent line of the file
- **THEN** the document contains both the user's change and the other program's change, the user's text is unchanged, the document is still marked as unsaved, and the conflict warning bar is not shown

#### Scenario: Cursor stays in place
- **WHEN** the editor merges a change from disk made above the cursor
- **THEN** the cursor stays at the same place in the user's text

#### Scenario: Same change on both sides
- **WHEN** the document has an unsaved change and another program makes exactly the same change to the same lines of the file
- **THEN** the change appears once, and the conflict warning bar is not shown

#### Scenario: Undo after a merge
- **WHEN** the editor merged a change from disk and the user undoes
- **THEN** the merged change is removed, the user's own unsaved changes remain, and the document is still marked as unsaved

#### Scenario: Saving after a merge
- **WHEN** the editor merged a change from disk, and the user saves without the file changing again
- **THEN** the file is written with exactly the editor's text, without any warning

#### Scenario: Line endings changed externally with unsaved changes
- **WHEN** the document has unsaved changes and another program converts the file's line endings
- **THEN** nothing is merged and the warning bar is shown

### Requirement: Lines loaded from disk are highlighted
Lines whose text came from the file on disk through a merge or a reload SHALL be highlighted, and resting the pointer on one SHALL show a tooltip saying its text came from disk. After a merge, the highlight MUST stay until the document matches the file on disk again (for example, after saving), the merge is undone, or the user clears it. After a reload, it MUST fade out on its own within a few seconds. The highlight MUST NOT change the document's text.

#### Scenario: Highlight after a merge
- **WHEN** the editor merges a change from disk
- **THEN** the lines that came from disk are highlighted, and other lines are not

#### Scenario: Highlight stays until saved
- **GIVEN** the editor merged a change from disk and its lines are highlighted
- **WHEN** the user keeps editing elsewhere and then saves
- **THEN** the lines stay highlighted while the user edits, and the highlight is gone after the save

#### Scenario: Several merges before saving
- **WHEN** the editor merges two separate changes from disk before the user saves
- **THEN** the lines from both changes are highlighted

#### Scenario: Undoing a merge removes its highlight
- **WHEN** the editor merged a change from disk and the user undoes
- **THEN** no line is highlighted for that merge

#### Scenario: Tooltip on a highlighted line
- **WHEN** the pointer rests on a highlighted line
- **THEN** a tooltip says the line was merged or reloaded from disk

#### Scenario: Highlight after a reload fades
- **WHEN** the editor reloads the document, automatically or because the user chose *Reload from disk*
- **THEN** the lines that changed are highlighted, and the highlight disappears by itself within a few seconds

#### Scenario: Deleted lines
- **WHEN** another program only deletes lines of the file and the editor merges or reloads it
- **THEN** the lines are removed and nothing is highlighted

### Requirement: Merged lines are explained by an informational bar
While lines merged from disk are highlighted, the editor SHALL show a non-modal informational bar saying that changes from disk were merged and are highlighted, with a *Clear highlight* action that removes the highlight and leaves the text unchanged. The bar MUST disappear when the highlight does, MUST NOT take keyboard focus, and MUST give way to the conflict or deleted bar, coming back after them while the highlight remains.

#### Scenario: Bar after a merge
- **WHEN** the editor merges a change from disk
- **THEN** the informational bar appears with a *Clear highlight* action, and keys typed afterwards go to the editor

#### Scenario: Clearing the highlight
- **WHEN** the informational bar is shown and the user chooses *Clear highlight*
- **THEN** no line is highlighted, the bar disappears, the text is unchanged, the document is still marked as unsaved, and keys typed afterwards go to the editor

#### Scenario: Bar goes with the highlight
- **WHEN** the informational bar is shown and the user saves, or undoes the merge
- **THEN** the highlight and the bar disappear

#### Scenario: A conflict takes over and the bar comes back
- **GIVEN** the informational bar is shown
- **WHEN** another program then makes a change that conflicts with the user's changes
- **THEN** the conflict warning bar replaces it, and after the user chooses *Keep mine* the informational bar is shown again while the merged lines are still highlighted

#### Scenario: No bar after a reload
- **WHEN** the editor reloads the document, automatically or because the user chose *Reload from disk*
- **THEN** no informational bar is shown
