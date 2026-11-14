# Spec Delta

## MODIFIED Requirements

### Requirement: Reading Mode does not reveal markers
In Reading Mode, the editor SHALL show the document rendered wherever the caret or selection is. Markdown markers that edit mode reveals around the caret (such as `#`, `**`, `[]()`, list and task markers) MUST stay hidden or rendered. The one exception is an open search: an element whose hidden text holds a match shows its markers, as the `search` capability specifies, until the search is closed.

#### Scenario: Caret on a heading
- **GIVEN** Reading Mode is on
- **WHEN** the caret is placed on a heading line
- **THEN** the `#` marker is not shown

#### Scenario: Selecting bold text
- **GIVEN** Reading Mode is on
- **WHEN** the user selects a word written as `**bold**`
- **THEN** the `**` markers are not shown

#### Scenario: Search match in visible text
- **GIVEN** Reading Mode is on and the document contains `**bold**`
- **WHEN** the user searches for `bold` and steps to that match
- **THEN** the word is selected and highlighted, and the `**` markers are not shown

#### Scenario: Search match in hidden text
- **GIVEN** Reading Mode is on and the document contains `**bold**`
- **WHEN** the user searches for `**`
- **THEN** the `**` markers of that word are shown dimmed, and they are hidden again when the search panel is closed
