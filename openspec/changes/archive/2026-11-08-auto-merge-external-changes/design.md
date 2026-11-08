# Design

## Context

See proposal.md (Why) and specs/file-sync/spec.md for the required behavior.

Current state relevant to the approach:

- `src/main.ts` keeps `disk: string | null` (the raw content last read from or written to the file, the merge base), `saved: Text` (for `isDirty()`) and `external` (latest disk content while the conflict bar is up). All disk reads and the decisions that follow run through one promise chain (`serial()`), and `applyDisk(content)` decides synchronously right after each read: deleted / unchanged / adopt / reload / conflict. `writeTo()` calls `applyDisk()` when the disk differs from `disk` and returns `!isDirty()`.
- `src/editor/reload.ts` turns the new content into one transaction with a single replacement (common prefix and suffix), with `isolateHistory` and `userEvent: 'reload'`, or answers `'rebuild'` when the line separator differs from the state's.
- `EditorState.lineSeparator` is fixed per state (`\r\n` when the file has it). Document positions count a separator as one character, so offsets into the raw strings are not document positions. `state.toText(s)` splits with the state's separator.
- Decorations: `hybrid.ts` (ViewPlugin) adds line classes such as `cm-md-codeblock`, which paint a background (`--code-bg`). `softbreaks.ts` (StateField) replaces single line breaks inside paragraphs with a space, so with *Join* on, several document lines render as one `.cm-line`.

## Goals / Non-Goals

**Goals:**
- One pure, unit-tested function computes the merge (or the conflict) from three texts in the state's coordinates. `main.ts` only decides when to call it and what to do with the result.
- The same line diff drives clean reloads, so reloads and merges apply and highlight changes the same way.
- The highlight is a view decoration only, owned by an editor extension, and its lifetime rules are explicit effects that `main.ts` dispatches.

**Non-Goals:**
- Merging within a line, conflict markers, a compare view, partial merges.
- Faster diff algorithms (patience, histogram). Plain Myers with prefix/suffix trimming is enough for markdown files.

## Decisions

### 1. Line diff: Myers over the lines of `Text`

A new pure module `src/editor/linediff.ts` diffs two `Text` values built with `state.toText()`, comparing lines. (It is separate from `merge.ts` so that `reload.ts`, which uses the diff, and `merge.ts`, which uses `reload.ts`'s `minimalReplacement`, do not import each other.) Each line carries its own separator, so a last line without a final line break is a different line from the same text with one. It returns hunks `{ fromA, toA, fromB, toB }` in line numbers. Common leading and trailing lines are trimmed before running Myers (O((N+M)·D)), so the usual small change costs almost nothing.

- *Why `Text` lines and not raw strings:* lines and positions come out in document coordinates (a `\r\n` counts as one), which is what transactions need. A lone `\n` inside a CRLF file stays part of a line's text, as in `reloadTransaction`. Because the separator is part of the line, the position range of a hunk is simply from the start of its first line to the start of the line after its last, on both sides, with no special case for the end of the file.
- *Alternatives:* `node-diff3` (adds a dependency and works on arrays, so the coordinate mapping is still ours); `@codemirror/merge`'s `diff` (character-level; rounding to lines adds work, and the merge view it enables is out of scope). Writing ~80 lines of Myers keeps the project dependency-free here, and it is easy to test.

### 2. Three-way merge: all or nothing, conservative overlap rule

`mergeChanges(state, base, theirs)` diffs `base → buffer` (A) and `base → theirs` (B). In base line numbers, hunks `a` and `b` conflict when `a.toA >= b.fromA && b.toA >= a.fromA`. That covers overlapping ranges, adjacent ranges and insertions at the same point (empty ranges). A `b` identical to some `a` (same base range, same new lines) is already in the buffer: it is dropped, not a conflict. Any conflict means the result is `'conflict'`, and nothing is applied.

If the separator of `base` or `theirs` (`lineBreakFor`) differs from the state's, the result is `'conflict'`: the separator cannot change within a transaction, and a merge must not rebuild the state over the user's unsaved text.

- *Why "touching" counts:* this matches git. Two edits on neighbouring lines are often one logical edit (a list item and the next one), and combining them silently is where line merges go wrong.
- *Why all or nothing:* a partial merge leaves a state that is neither version and that no bar can describe.

### 3. Applying: map the other side's changes through the user's

The B hunks become a `ChangeSet` over the base document. Each hunk is narrowed with `minimalReplacement` (common prefix and suffix within the hunk's text), so a one-word change on disk does not replace the whole line and the cursor keeps its exact place. The A hunks become a `ChangeSet` over the base too, and `changesB.map(changesA)` gives B's changes in buffer coordinates. Because no hunks touch, the mapping is unambiguous. The result is one transaction with `isolateHistory.of('full')` and `userEvent: 'reload.merge'`, so one undo removes exactly what was merged.

- *Why map changes and not replace the buffer with the merged text:* the user's characters are never rewritten (fidelity), the cursor and scroll are mapped by CodeMirror, and undo history stays meaningful.
- *Alternative:* build the merged string and apply `reloadTransaction`. Simpler, but its single prefix/suffix replacement would span the user's own edits between two merged hunks, and undo would then also take away the user's typing.

### 4. Clean reload reuses the same path

A clean reload is a merge where A is empty: `reloadTransaction(state, content)` becomes the line diff of document → content, each hunk narrowed as above, applied as one transaction (`userEvent: 'reload'`, still `'rebuild'` on a separator change). The existing unit tests for `reloadTransaction` stay valid, and the cursor survives better when a reload touches several distant places. `minimalReplacement` stays as the per-hunk narrowing.

### 5. Highlight: a `StateField` of ranges, rendered as line classes

New module `src/editor/incoming.ts`:

- A `StateField` keeps a `RangeSet` of the inserted ranges (from the transaction's `iterChanges`, `fromB..toB` where non-empty), each tagged `persistent` (merge) or `fading` (reload). It maps them through every change. A range whose text is deleted collapses and is dropped, which is how undoing a merge removes its highlight without any special case.
- Effects: `addIncoming({ ranges, kind })`, carried by the merge and reload transactions; `clearIncoming(kind)`.
- It provides line decorations (`cm-incoming`, plus `cm-incoming-fading`) for every line a range touches. They come from a StateField, as `softbreaks.ts` does, so they are available for the whole document.
- A small ViewPlugin in the same module notices new `fading` ranges and dispatches `clearIncoming('fading')` after about 1.5 s. The fade itself is a CSS transition when the class goes away, so no timer lives in `main.ts`. The transition must not delay the highlight appearing: a transition uses the style the element ends up with, so the highlighted line sets `transition: none` and the base `.cm-line` rule carries the fade.
- Styling in `EditorView.theme` (`setup.ts`) with colors from `styles.css` tokens (light and dark): an inset `box-shadow` tint plus a thin accent bar on the left. A box-shadow paints above the line's background, so the highlight also shows on fenced code lines that already have `--code-bg`, and it can be transitioned.
- Insertions only. A pure deletion has no surviving text to mark, which matches the spec scenario *Deleted lines*.

### 6. `main.ts`: where the merge enters

```
applyDisk(content, { fromSave })
  null                      -> showDeleted()                  (unchanged)
  == disk                   -> hide conflict bar if any       (unchanged)
  == buffer                 -> adopt(content)                 (unchanged)
  buffer clean              -> reloadInto(content) + notice   (now with fading highlight)
  else mergeChanges(...)
     'conflict'             -> showConflict(content)          (unchanged)
     transaction / null     -> saved = toText(theirs); external = null; dispatch(tr);
                               disk = theirs; showMerged()   (decision 7)
```

- The base is always `disk`, which is not updated while the conflict bar is up, so a later change on disk retries the merge against the same base (spec: *Later change on disk merges cleanly*).
- `saved` is set to the disk content before dispatching, as `reloadInto` does, so the title is right throughout. The buffer differs from it (it still has the user's edits), so the document stays unsaved.
- `writeTo()` passes `fromSave = true` and keeps returning `!isDirty()`. After a merge that is `false`, so nothing is written.
- Persistent highlights are cleared (`clearIncoming('persistent')`) whenever the document matches the disk again: in `adopt()` (which `reloadInto` also runs) and after a successful write. `load()` builds a new state, which starts empty. The reload's own `addIncoming(fading)` goes in the same transaction as its changes, and `adopt()` clears only `persistent`, so the reload's fading highlight survives.

### 7. Explaining the highlight: an informational bar, plus a tooltip

A green line with no explanation surprises anyone who did not watch the merge happen, and the 2.5 s notice is gone long before. The rule already in the app is that the notice is for something that happened and the bar for a state that persists. A persistent highlight is such a state, so it gets an informational bar (kind `merged` in `bar.ts`, in green like the highlight: green reads as added lines in any diff, a blue highlight would look like the indigo selection, and it keeps the bar apart from the blue `deleted` one) that lives exactly as long as the persistent highlight, with one button, *Clear highlight*, for a user who has reviewed the lines and wants to keep writing without them. The bar replaces the merge notice; reloads keep the notice and the fading highlight, since nothing is left pending.

- `main.ts` owns the pairing with one helper, `showMerged()`: show the `merged` bar if `hasIncoming(state, 'persistent')`, otherwise hide the bar. It runs after every decision that leaves no other bar: a successful merge, *Keep mine*, and the conflict bar going away because the disk went back to the base. Places that remove the highlight hide the bar with it: `adopt()` and a successful write (which already hide the bar), *Clear highlight*, and `onDocChange` for an undo that takes the merged text away (DOM only, so it is safe inside the update listener).
- The conflict and deleted bars take precedence: there is one bar element, and the urgent message wins. When they go away, `showMerged()` brings the explanation back if the highlight is still there.
- A save that finds a change the document already contains (`mergeChanges` answers null) leaves no highlight to explain, so it keeps a notice telling the user to save again.
- Tooltip: a `title` attribute on the highlighted line decorations ("Merged from disk" / "Reloaded from disk"). It is native, costs one attribute, and answers the question for a user who hovers before reading the bar.
- *Alternatives:* a tooltip alone is only found by someone who already suspects something; a persistent floating pill where the notice is would not move the text, but it covers the last lines of the document (seen in the screenshots), and the bar is a pattern the app already has.

## Risks / Trade-offs

- [A line merge combines edits that are textually separate but logically related, e.g. the other side renames a term used in a paragraph the user is editing] → The touch rule removes the closest cases. The persistent highlight shows what came in, one undo removes it, and nothing is written until the user saves.
- [The bar pushes the editor down a few pixels when it appears and when it goes away, while the user may be typing] → The same as the existing bars; it never takes focus, and it appears only after a merge, not after every reload.
- [A large external rewrite (`git checkout`) that does not touch the user's lines is merged without asking] → Accepted, with no size threshold: the merge loses nothing, the highlight shows its extent, and undo reverts it in one step.
- [With *Join* line breaks on (the default), several document lines render as one `.cm-line`, and CodeMirror drops the line decorations of all but the first] → Confirmed by an e2e test, so `incoming.ts` decorates the first document line of the visual line that contains a range, found through the soft-break decorations. The decorations are rebuilt when the editor is reconfigured, so switching *Line Breaks* keeps them right.
- [The transition restarts if CodeMirror recreates a line's DOM while it fades] → Cosmetic only. Classes are normally updated on the existing element; the e2e test checks only the start and end states.
- [Myers degrades on files where nearly every line changed] → After prefix/suffix trimming, D is the number of changed lines, and markdown files are small (thousands of lines at most). The cost was not measured; check one large example file in a unit test.

## Migration Plan

None. No persisted data or settings change. Rollback is reverting the change: `disk`, the conflict bar and the save check keep working without it.

## Open Questions

- Exact highlight tint and fade timing: tune from the e2e screenshots and daily use. They are tokens and one constant.
