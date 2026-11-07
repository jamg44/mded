## ADDED Requirements

### Requirement: No smart quote substitution
On macOS, the editor SHALL insert straight quotes exactly as typed. Typing `"` or `'` MUST NOT be replaced with typographic quotes (`“`, `”`, `‘`, `’`), whatever the system setting "Use smart quotes and dashes" says.

#### Scenario: Typing a double quote
- **WHEN** the user types `"` in the editor, with smart quotes enabled in System Settings
- **THEN** the document contains the ASCII character `"` (U+0022), and the saved file contains it unchanged

#### Scenario: Typing an apostrophe
- **WHEN** the user types `don't` in the editor
- **THEN** the document contains `don't` with the ASCII apostrophe (U+0027)

### Requirement: No smart dash substitution
On macOS, the editor SHALL insert hyphens exactly as typed. Typing `--` MUST NOT be replaced with an em dash (`—`) or an en dash (`–`), whatever the system setting.

#### Scenario: Typing two hyphens and Enter
- **WHEN** the user types `--` followed by Enter or a space
- **THEN** the document contains two ASCII hyphens (U+002D)

#### Scenario: Typing a thematic break or a frontmatter fence
- **WHEN** the user types `---` on a line of its own
- **THEN** the line contains exactly three ASCII hyphens, and the markdown parser still sees a thematic break or a fence

### Requirement: No automatic spelling correction
On macOS, the editor SHALL NOT automatically replace a word the user typed with a spelling suggestion.

#### Scenario: Typing a misspelled word
- **WHEN** the user types a word the spell checker flags (e.g. `teh`) followed by a space
- **THEN** the document keeps the word exactly as typed

### Requirement: User text replacements are kept
Text replacements that the user defined in System Settings SHALL keep working, since the user triggers them deliberately. mded MUST NOT override the system's text replacement setting.

#### Scenario: User-defined text replacement
- **WHEN** the user has a text replacement defined in System Settings (e.g. `omw` → `On my way!`) and types its shortcut followed by a space
- **THEN** the replacement is applied, as in other macOS apps

### Requirement: An explicit user choice takes precedence
The defaults mded applies SHALL NOT be written to the user's preferences. A value the user has set explicitly for mded's defaults domain MUST take precedence over them.

#### Scenario: User re-enables smart quotes for mded
- **WHEN** the user has run `defaults write io.github.jamg44.mded WebAutomaticQuoteSubstitutionEnabled -bool true`
- **THEN** mded applies smart quotes

#### Scenario: Nothing is persisted
- **WHEN** mded has been launched and closed
- **THEN** `defaults read io.github.jamg44.mded` shows none of the substitution keys that mded set
