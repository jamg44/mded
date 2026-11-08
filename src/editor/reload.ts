import { isolateHistory } from '@codemirror/commands';
import type { EditorState, Transaction } from '@codemirror/state';

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
 * Transaction that turns the document into `content` (the new content of the file on
 * disk) by replacing only the part that differs. Compared with rebuilding the state,
 * the cursor is mapped through the change, the scroll position stays, and undo brings
 * the previous text back.
 *
 * Returns null when nothing differs, or when the file's line separator changed: the
 * separator is fixed when the state is created, so the caller has to rebuild it.
 */
export function reloadTransaction(state: EditorState, content: string): Transaction | null | 'rebuild' {
  if (state.lineBreak !== lineBreakFor(content)) return 'rebuild';
  // toText splits with the state's own separator, so a lone "\n" in a CRLF file stays text
  const next = state.toText(content);
  const change = minimalReplacement(state.doc.toString(), next.toString());
  if (!change) return null;
  const grown = next.length - state.doc.length;
  return state.update({
    changes: { from: change.from, to: change.to, insert: next.slice(change.from, change.to + grown) },
    // Its own undo step, so undo reverts exactly the reload and not typing before it
    annotations: isolateHistory.of('full'),
    userEvent: 'reload',
  });
}
