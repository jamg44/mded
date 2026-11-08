import { isolateHistory } from '@codemirror/commands';
import { ChangeSet, type EditorState, type Transaction } from '@codemirror/state';
import { incomingFor } from './incoming';
import { diffKeys, type LineHunk, linesOf } from './linediff';
import { hunkChange, lineBreakFor } from './reload';

/**
 * Three-way merge by lines, for a document with unsaved changes while the file changed
 * on disk. `base` is the file as the document was last in sync with it, `state.doc` is
 * "mine" and `theirs` is the file now.
 *
 * It does not build the merged text. It takes what the other side changed and applies it to
 * the document, so the user's own characters are never rewritten, the cursor and scroll are
 * mapped by CodeMirror, and one undo takes away exactly what was merged.
 *
 * - `'conflict'`: some lines changed on both sides overlap or touch, or the line separator
 *   differs (it cannot change inside a transaction). Nothing is applied, all or nothing.
 * - `null`: the document already has everything that changed on disk.
 * - otherwise, the transaction that applies the other side's changes.
 */
export function mergeChanges(
  state: EditorState,
  base: string,
  theirs: string,
): Transaction | null | 'conflict' {
  const sep = state.lineBreak;
  if (lineBreakFor(base) !== sep || lineBreakFor(theirs) !== sep) return 'conflict';

  const baseText = state.toText(base);
  const theirText = state.toText(theirs);
  const baseLines = linesOf(baseText);
  const myLines = linesOf(state.doc);
  const theirLines = linesOf(theirText);
  const mine = diffKeys(baseLines.keys, myLines.keys);
  const others = diffKeys(baseLines.keys, theirLines.keys);

  const sameChange = (a: LineHunk, b: LineHunk) =>
    a.fromA === b.fromA &&
    a.toA === b.toA &&
    a.toB - a.fromB === b.toB - b.fromB &&
    myLines.keys.slice(a.fromB, a.toB).every((key, i) => key === theirLines.keys[b.fromB + i]);

  // Two hunks conflict when their lines overlap or touch (a.toA >= b.fromA and b.toA >= a.fromA),
  // as in git: neighbouring lines are often one logical edit, and combining them silently is
  // where a line-based merge goes wrong. Insertions at the same point count as touching.
  // Both lists are in order and their hunks do not touch each other, so one pass is enough.
  const toApply: LineHunk[] = [];
  let first = 0;
  for (const theirHunk of others) {
    while (first < mine.length && mine[first].toA < theirHunk.fromA) first++;
    let end = first;
    while (end < mine.length && mine[end].fromA <= theirHunk.toA) end++;
    const clashes = end - first;
    if (clashes === 0) toApply.push(theirHunk);
    // The same edit on both sides is already in the document
    else if (clashes > 1 || !sameChange(mine[first], theirHunk)) return 'conflict';
  }

  const theirChanges = toApply.flatMap((h) => {
    const change = hunkChange(baseText, baseLines, theirText, theirLines, h);
    return change ? [change] : [];
  });
  if (!theirChanges.length) return null;

  // Both sets describe changes to `base`: map the other side's over mine to get them in the document
  const myChanges = mine.flatMap((h) => {
    const change = hunkChange(baseText, baseLines, state.doc, myLines, h);
    return change ? [change] : [];
  });
  const merged = ChangeSet.of(theirChanges, baseText.length, sep).map(
    ChangeSet.of(myChanges, baseText.length, sep),
  );
  if (merged.empty) return null;

  const effect = incomingFor(merged, 'persistent');
  return state.update({
    changes: merged,
    effects: effect ? [effect] : [],
    // Its own undo step, so undo reverts exactly the merge and not typing before it
    annotations: isolateHistory.of('full'),
    userEvent: 'reload.merge',
  });
}
