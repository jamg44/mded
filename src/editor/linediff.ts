import type { Text } from '@codemirror/state';

/**
 * A run of lines of `a` that is replaced by a run of lines of `b`. Line indexes are
 * 0-based and the ranges half-open: lines `fromA..toA-1` of `a` become `fromB..toB-1` of `b`.
 * An empty range on one side is a pure insertion or deletion.
 */
export interface LineHunk {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
}

/** A document split into lines that carry their own separator, ready to be compared. */
export interface Lines {
  /**
   * One entry per line, equal when the lines are interchangeable. The separator is part of
   * the line: a last line without a final line break is not the same line as one with it,
   * so the text before and after adding or removing the final break differs in one line.
   */
  keys: string[];
  /** Document position where each line starts, plus one last entry: the document's length. */
  starts: number[];
}

export function linesOf(doc: Text): Lines {
  const keys: string[] = [];
  const starts: number[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const last = n === doc.lines;
    // What follows a final line break is not a line
    if (last && line.length === 0) break;
    // The prefix keeps "x" + separator from colliding with a last line whose text ends in "\n"
    keys.push((last ? '0' : '1') + line.text);
    starts.push(line.from);
  }
  starts.push(doc.length);
  return { keys, starts };
}

/**
 * Past this many differing lines the exact diff is not worth its memory (it grows with the
 * square of the differences): the whole differing region becomes one hunk. Still correct,
 * just coarser, which for a merge only means more conflicts.
 */
const MAX_EDITS = 1500;

/** The hunks that turn `a` into `b` (Myers, so as few changed lines as possible). */
export function diffKeys(a: string[], b: string[]): LineHunk[] {
  const shortest = Math.min(a.length, b.length);
  let start = 0;
  while (start < shortest && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return [];

  const whole = { fromA: 0, toA: endA - start, fromB: 0, toB: endB - start };
  const inner =
    start === endA || start === endB
      ? [whole]
      : (myers(a.slice(start, endA), b.slice(start, endB)) ?? [whole]);
  return inner.map((h) => ({
    fromA: h.fromA + start,
    toA: h.toA + start,
    fromB: h.fromB + start,
    toB: h.toB + start,
  }));
}

export function diffLines(a: Text, b: Text): LineHunk[] {
  return diffKeys(linesOf(a).keys, linesOf(b).keys);
}

/** Myers' O(ND) diff, or null when it needs more than MAX_EDITS single-line edits. */
function myers(a: string[], b: string[]): LineHunk[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const off = max + 1;
  // v[off + k]: furthest x reached on diagonal k (k = x - y)
  const v = new Int32Array(2 * max + 3);
  // trace[d]: the part of v that round d reads, as it was before that round
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
      let x = down ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return null;
}

/** Walks the rounds backwards, collecting the single-line edits and joining those that touch. */
function backtrack(trace: Int32Array[], n: number, m: number): LineHunk[] {
  const edits: LineHunk[] = [];
  let x = n;
  let y = m;
  // Round 0 is only the diagonal from the origin: it has no edit
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d];
    const at = (k: number) => prev[k + d + 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const px = at(prevK);
    const py = px - prevK;
    edits.push(
      down ? { fromA: px, toA: px, fromB: py, toB: py + 1 } : { fromA: px, toA: px + 1, fromB: py, toB: py },
    );
    x = px;
    y = py;
  }
  edits.reverse();

  const hunks: LineHunk[] = [];
  for (const e of edits) {
    const last = hunks[hunks.length - 1];
    if (last && last.toA === e.fromA && last.toB === e.fromB) {
      last.toA = e.toA;
      last.toB = e.toB;
    } else {
      hunks.push({ ...e });
    }
  }
  return hunks;
}
