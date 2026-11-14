# Spec Delta

## Purpose

Lets the user find text in the open document and replace it, searching the text of the file exactly as it is written and changing nothing but the matches that are replaced.

## ADDED Requirements

### Requirement: The search panel opens and closes
The editor SHALL offer a search panel, opened with Cmd+F (Ctrl+F outside macOS) or *Edit → Find…*, with the keyboard focus in its search field. Escape, or the panel's close button, SHALL close it and return the keyboard focus to the text. Opening the panel when it is already open SHALL move the focus back to the search field.

#### Scenario: Opening with the shortcut
- **WHEN** the user presses Cmd+F while the caret is in the text
- **THEN** the search panel is shown at the top of the editor and typing goes into its search field

#### Scenario: Closing with Escape
- **GIVEN** the search panel is open
- **WHEN** the user presses Escape
- **THEN** the panel goes away, no match is highlighted, and typing goes into the text again

#### Scenario: Cmd+F with the panel already open
- **GIVEN** the search panel is open and the caret is in the text
- **WHEN** the user presses Cmd+F
- **THEN** the panel stays open and the keyboard focus is in its search field

### Requirement: Search runs over the text of the file
Search SHALL match against the text of the file as it is written, including markdown markers and text that hybrid mode hides, in edit mode and in Reading Mode alike. It MUST NOT match against the rendered text.

#### Scenario: Searching for a marker
- **GIVEN** the document contains `**bold**`
- **WHEN** the user searches for `**`
- **THEN** the two `**` markers are matches

#### Scenario: Phrase interrupted by a marker
- **GIVEN** the document contains `is **important**`, shown as "is important"
- **WHEN** the user searches for `is important`
- **THEN** there is no match

#### Scenario: Text inside a hidden URL
- **GIVEN** the document contains `[Example](https://example.com)`
- **WHEN** the user searches for `example.com`
- **THEN** the URL of the link is a match

### Requirement: Searching does not change the document
Opening the panel, typing a search, stepping through matches and closing the panel SHALL NOT change the text of the document, and MUST NOT mark it as having unsaved changes.

#### Scenario: Searching a saved document
- **GIVEN** a document with no unsaved changes
- **WHEN** the user opens the panel, searches for a word, steps through three matches and closes the panel
- **THEN** the text is unchanged and the window title shows no unsaved-changes mark

### Requirement: Matches are highlighted
While the panel is open, every match in view SHALL be highlighted, and the current match SHALL be told apart from the others. The highlights MUST go away when the panel is closed or the search field is emptied.

#### Scenario: Several matches in view
- **GIVEN** the visible part of the document contains a word three times
- **WHEN** the user searches for that word
- **THEN** the three occurrences are highlighted

#### Scenario: Current match
- **GIVEN** a search with several matches
- **WHEN** the user steps to a match
- **THEN** that match is highlighted differently from the rest

#### Scenario: Match inside inline code
- **GIVEN** the document contains the inline code `` `00-vision-sistema.md` ``, shown as one piece of code
- **WHEN** the user searches for `si`
- **THEN** both occurrences are highlighted inside it, and the code is still shown as one piece, with no gaps around the matches

### Requirement: The panel counts the matches
While a search is typed, the panel SHALL show, right after the search field, how many matches the whole document has, counting those outside the window and those in hidden text. When the selection is one of the matches, it SHALL also show that match's position, as in "3 of 7". The count MUST follow the document: it is updated when the search, its options or the text change. Its place MUST be kept when it shows nothing, so the controls after it do not move.

#### Scenario: Stepping through matches
- **GIVEN** a search with seven matches in the document
- **WHEN** the user steps to the third match
- **THEN** the panel shows "3 of 7"

#### Scenario: Matches outside the window
- **GIVEN** a long document where a word appears twice in view and five more times further down
- **WHEN** the user searches for that word
- **THEN** the panel's count is 7

#### Scenario: Selection is not a match
- **GIVEN** a search with seven matches
- **WHEN** the user clicks in the text, away from any match
- **THEN** the panel shows "7 matches", with no position

#### Scenario: No matches
- **WHEN** the user searches for text the document does not contain
- **THEN** the panel shows "No matches"

#### Scenario: Empty search
- **WHEN** the search field is empty
- **THEN** the panel shows no count

#### Scenario: The count appearing does not move the buttons
- **GIVEN** the panel is open with an empty search
- **WHEN** the user types a search and the count appears
- **THEN** the previous and next buttons are where they were

#### Scenario: Count after replacing
- **GIVEN** a search with seven matches, the first of them selected
- **WHEN** the user replaces it with text that does not match the search
- **THEN** the panel shows "1 of 6"

### Requirement: Stepping through matches
The user SHALL be able to go to the next match with Enter in the search field, Cmd+G, *Edit → Find Next* or the panel's down arrow, and to the previous one with Shift+Enter, Cmd+Shift+G, *Edit → Find Previous* or the up arrow. Going to a match SHALL select it and bring it into view. After the last match the search SHALL continue from the first, and the other way round.

#### Scenario: Next match
- **GIVEN** a search with matches after the caret
- **WHEN** the user presses Enter in the search field
- **THEN** the first match after the caret is selected and in view

#### Scenario: Wrapping around
- **GIVEN** the last match of the document is selected
- **WHEN** the user goes to the next match
- **THEN** the first match of the document is selected

#### Scenario: Match outside the window
- **GIVEN** the next match is further down than the window shows
- **WHEN** the user goes to the next match
- **THEN** the document scrolls so that the match is visible and not covered by the panel

#### Scenario: Arrow buttons
- **GIVEN** a search with matches
- **WHEN** the user clicks the down arrow, and then the up arrow
- **THEN** the next match is selected, and then the one before it

#### Scenario: Stepping from the text
- **GIVEN** the panel is open with a search and the keyboard focus is in the text
- **WHEN** the user presses Cmd+G
- **THEN** the next match is selected

### Requirement: Search options
The panel SHALL offer three options, all off by default: match case, whole word, and regular expression. With all of them off, the search is a literal, case-insensitive one. An invalid regular expression SHALL match nothing and MUST NOT change the document or raise an error.

#### Scenario: Case-insensitive by default
- **GIVEN** the document contains `Markdown` and `markdown`
- **WHEN** the user searches for `markdown`
- **THEN** both are matches

#### Scenario: Match case
- **GIVEN** the document contains `Markdown` and `markdown`
- **WHEN** the user turns on match case and searches for `markdown`
- **THEN** only `markdown` is a match

#### Scenario: Whole word
- **GIVEN** the document contains `list` and `lists`
- **WHEN** the user turns on whole word and searches for `list`
- **THEN** only `list` is a match

#### Scenario: Regular expression
- **GIVEN** the document contains `v1.2` and `v3.4`
- **WHEN** the user turns on regular expression and searches for `v\d\.\d`
- **THEN** both are matches

#### Scenario: Invalid regular expression
- **WHEN** the user turns on regular expression and types `(`
- **THEN** nothing is highlighted and the document is unchanged

### Requirement: A match in hidden text shows its element's markers
While the panel is open, when a match overlaps text that hybrid mode hides or replaces (a marker, a link's URL or title, an image's markdown, a bullet, a task box), the element that text belongs to SHALL show its markers dimmed, as it does when the caret is in it. This SHALL apply in edit mode and in Reading Mode, and MUST stop when the panel is closed or the match is gone.

#### Scenario: Match in a link's URL
- **GIVEN** the document contains `[Example](https://example.com)`, shown as "Example", and the caret is elsewhere
- **WHEN** the user searches for `example.com`
- **THEN** the link is shown as `[Example](https://example.com)` with its markers dimmed, and the match is highlighted

#### Scenario: Match only in visible text
- **GIVEN** the document contains `**bold**`, shown as "bold", and the caret is elsewhere
- **WHEN** the user searches for `bold`
- **THEN** the word is highlighted and the `**` markers stay hidden

#### Scenario: Closing the panel
- **GIVEN** a link is showing its markers because its URL matches the search
- **WHEN** the user closes the panel
- **THEN** the link is shown rendered again

#### Scenario: Match in hidden text while reading
- **GIVEN** Reading Mode is on and the document contains `[Example](https://example.com)`
- **WHEN** the user searches for `example.com`
- **THEN** the link is shown with its markers dimmed and the match is highlighted

### Requirement: The replace controls are shown on request
Opening the panel to search (Cmd+F, *Edit → Find…*) SHALL show the search controls only. In edit mode an arrow at the left of the panel SHALL show and hide the replace controls without moving the keyboard focus, and *Find and Replace…* SHALL show them. While the panel stays open they SHALL stay as the user left them, also across a visit to Reading Mode. A panel opened again to search SHALL start without them.

#### Scenario: Opening to search
- **WHEN** the user presses Cmd+F in edit mode
- **THEN** the panel shows the search field and its options, and no replace field or replace buttons

#### Scenario: Showing them with the arrow
- **GIVEN** the panel is open with the keyboard focus in the search field
- **WHEN** the user clicks the arrow at the left of the panel
- **THEN** the replace field and its buttons are shown below the search field, lined up with it, and the keyboard focus is still in the search field

#### Scenario: Hiding them with the arrow
- **GIVEN** the replace controls are shown and the keyboard focus is in the replace field
- **WHEN** the user clicks the arrow
- **THEN** the replace controls are hidden and the keyboard focus is in the search field

#### Scenario: Find on an open panel
- **GIVEN** the panel is open with the replace controls shown
- **WHEN** the user presses Cmd+F
- **THEN** the keyboard focus is in the search field and the replace controls are still shown

#### Scenario: Opening again
- **GIVEN** the replace controls were shown when the panel was closed
- **WHEN** the user presses Cmd+F
- **THEN** the panel opens without the replace controls

#### Scenario: Showing them halfway down a document
- **GIVEN** the panel is open and the window is scrolled halfway down a long document
- **WHEN** the user shows the replace controls, and then hides them
- **THEN** every line that is still visible is at the same position in the window as before

### Requirement: Replacing changes only the matches
In edit mode the panel SHALL offer, on request, a replace field with *replace* (the current match, then moves to the next) and *replace all*. A replacement SHALL change only the characters of the replaced matches: every other character of the document, including its line endings, MUST stay as it was. Replacing makes the document unsaved, like any other edit.

#### Scenario: Replacing one match
- **GIVEN** the document contains `cat` three times and the first one is the current match
- **WHEN** the user types `dog` in the replace field and chooses *replace*
- **THEN** the first `cat` is now `dog`, the other two are unchanged, and the second one is the current match

#### Scenario: Replacing all
- **GIVEN** the document contains `cat` three times
- **WHEN** the user chooses *replace all* with `dog`
- **THEN** the document contains `dog` three times and differs from the original only in those characters

#### Scenario: Document with Windows line endings
- **GIVEN** a file whose lines end in `\r\n`
- **WHEN** the user replaces a word and saves
- **THEN** every line of the saved file still ends in `\r\n`

#### Scenario: Replacing with nothing to replace
- **GIVEN** a search with no matches
- **WHEN** the user chooses *replace all*
- **THEN** the document is unchanged and does not become unsaved

### Requirement: Replace all is one undo step
Everything changed by one *replace all* SHALL be undone by a single Undo, and redone by a single Redo.

#### Scenario: Undoing replace all
- **GIVEN** *replace all* changed three matches
- **WHEN** the user chooses Undo once
- **THEN** the document is back to the text it had before the replacement

### Requirement: Reading Mode searches but does not replace
In Reading Mode the panel SHALL work for searching and MUST NOT offer the replace controls, and *Edit → Find and Replace…* SHALL be disabled. Using the panel MUST NOT change the document or show the notice about Reading Mode. Switching mode with the panel open SHALL keep the panel open with its search, adding or removing the replace controls.

#### Scenario: Searching while reading
- **GIVEN** Reading Mode is on
- **WHEN** the user presses Cmd+F, types a word and presses Enter
- **THEN** the matches are highlighted, the next one is selected and in view, the text is unchanged, and no notice about Reading Mode is shown

#### Scenario: No replace controls while reading
- **GIVEN** Reading Mode is on
- **WHEN** the user opens the search panel
- **THEN** the panel shows the search field and its options, and no replace field or replace buttons

#### Scenario: Switching to Reading Mode with the panel open
- **GIVEN** the panel is open in edit mode with a search typed and the replace controls shown
- **WHEN** the user switches to Reading Mode
- **THEN** the panel is still open with the same search, and the replace controls and the arrow that shows them are gone

#### Scenario: Switching back to editing with the panel open
- **GIVEN** the user switched to Reading Mode with the replace controls shown, and the panel is still open
- **WHEN** the user switches to editing
- **THEN** the panel is still open with the same search, and the replace controls are shown again

### Requirement: The panel does not move the text
Opening or closing the panel SHALL leave the text where it was on screen. The exception is the start of the document: when the panel would otherwise cover the first lines, the text SHALL move down to make room for it.

#### Scenario: Opening halfway down a document
- **GIVEN** the window is scrolled halfway down a long document
- **WHEN** the user opens the search panel
- **THEN** every line that is still visible is at the same position in the window as before

#### Scenario: Closing halfway down a document
- **GIVEN** the panel is open and the window is scrolled halfway down a long document
- **WHEN** the user closes the panel
- **THEN** every line that was visible is at the same position in the window as before

#### Scenario: Opening at the start of the document
- **GIVEN** the window shows the start of the document
- **WHEN** the user opens the search panel
- **THEN** the first line of the document is visible below the panel

### Requirement: The panel does not cover the Reading pill
While the panel is open in Reading Mode, the "Reading" pill SHALL stay fully visible and clickable, below the panel.

#### Scenario: Panel open while reading
- **GIVEN** Reading Mode is on
- **WHEN** the user opens the search panel
- **THEN** the pill is shown below the panel, and clicking it switches to editing

### Requirement: Search is in the Edit menu
The *Edit* menu SHALL offer *Find…* (Cmd+F), *Find Next* (Cmd+G), *Find Previous* (Cmd+Shift+G) and *Find and Replace…* (Cmd+Option+F). *Find and Replace…* SHALL open the panel with the keyboard focus in the replace field.

#### Scenario: Find and Replace from the menu
- **GIVEN** the document is open for editing
- **WHEN** the user chooses *Edit → Find and Replace…*
- **THEN** the search panel is open and typing goes into its replace field

#### Scenario: Find Next from the menu
- **GIVEN** the panel is open with a search that has matches
- **WHEN** the user chooses *Edit → Find Next*
- **THEN** the next match is selected
