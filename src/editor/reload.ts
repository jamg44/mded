import { isolateHistory } from '@codemirror/commands';
import type { EditorState, Text, Transaction } from '@codemirror/state';
import { incomingFor } from './incoming';
import { diffKeys, type LineHunk, type Lines, linesOf } from './linediff';

export interface Replacement {
  from: number;
  to: number;
  /** The text of `next` that replaces `prev.slice(from, to)`. */
  insert: string;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * The single smallest replacement that turns `prev` into `next` (common prefix and
 * suffix stripped), or null if they are equal. Positions are UTF-16 offsets, like
 * CodeMirror's, and never fall between the two halves of a surrogate pair.
 */
export function minimalReplacement(prev: string, next: string): Replacement | null {
  if (prev === next) return null;
  const max = Math.min(prev.length, next.length);

  let start = 0;
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  // Do not stop in the middle of an emoji: back off to the start of the pair
  if (start > 0 && isHigh(prev.charCodeAt(start - 1))) start--;

  let tail = 0;
  while (
    tail < max - start &&
    prev.charCodeAt(prev.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
  )
    tail++;
  if (tail > 0 && isLow(prev.charCodeAt(prev.length - tail))) tail--;

  return { from: start, to: prev.length - tail, insert: next.slice(start, next.length - tail) };
}

/** Line separator `createState` picks for a file's content. */
export const lineBreakFor = (content: string) => (content.includes('\r\n') ? '\r\n' : '\n');

/**
 * The change that turns the lines of `hunk` in `from` into their counterpart in `to`, cut
 * down to the characters that really differ (so a one-word edit does not replace its line
 * and a cursor inside the line keeps its place). Positions are those of `from`, and the text
 * to insert comes as a `Text`, which keeps a lone "\n" inside a line of a \r\n file as text.
 * Null when the two sides turn out to be the same text.
 */
export function hunkChange(
  from: Text,
  fromLines: Lines,
  to: Text,
  toLines: Lines,
  hunk: LineHunk,
): { from: number; to: number; insert: Text } | null {
  const start = fromLines.starts[hunk.fromA];
  const end = fromLines.starts[hunk.toA];
  const newStart = toLines.starts[hunk.fromB];
  const newEnd = toLines.starts[hunk.toB];
  // Both sides as strings joined with "\n": an index into them is a document position
  const r = minimalReplacement(from.sliceString(start, end), to.sliceString(newStart, newEnd));
  if (!r) return null;
  const at = newStart + r.from;
  return { from: start + r.from, to: start + r.to, insert: to.slice(at, at + r.insert.length) };
}

/**
 * Transaction that turns the document into `content` (the new content of the file on
 * disk) by replacing only the lines that differ, and within them only the characters that
 * differ. Compared with rebuilding the state, the cursor is mapped through the changes,
 * the scroll position stays, and undo brings the previous text back.
 *
 * Returns null when nothing differs, or when the file's line separator changed: the
 * separator is fixed when the state is created, so the caller has to rebuild it.
 */
export function reloadTransaction(state: EditorState, content: string): Transaction | null | 'rebuild' {
  if (state.lineBreak !== lineBreakFor(content)) return 'rebuild';
  // toText splits with the state's own separator, so a lone "\n" in a CRLF file stays text
  const next = state.toText(content);
  const current = linesOf(state.doc);
  const incoming = linesOf(next);
  const changes = diffKeys(current.keys, incoming.keys).flatMap((hunk) => {
    const change = hunkChange(state.doc, current, next, incoming, hunk);
    return change ? [change] : [];
  });
  if (!changes.length) return null;
  const set = state.changes(changes);
  const effect = incomingFor(set, 'fading');
  return state.update({
    changes: set,
    effects: effect ? [effect] : [],
    // Its own undo step, so undo reverts exactly the reload and not typing before it
    annotations: isolateHistory.of('full'),
    userEvent: 'reload',
  });
}
