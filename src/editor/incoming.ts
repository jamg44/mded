// Highlights the lines whose text came from the file on disk, after a merge or a reload.
//
// View only: the document is never touched. It lives in a StateField (like softbreaks.ts),
// not in the hybrid ViewPlugin, so the lines are decorated for the whole document and not
// just what is on screen.
//
// - 'persistent' (after a merge): stays until the document is the file on disk again, which
//   main.ts announces with `clearIncoming('persistent')`.
// - 'fading' (after a reload, where there is nothing left to save or review): removed by a
//   timer; the CSS transition on the line makes it fade out instead of vanishing.
import { type ChangeSet, type EditorState, type Line, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from '@codemirror/view';
import { joinSoftBreaks } from './softbreaks';

export type IncomingKind = 'persistent' | 'fading';

interface Incoming {
  from: number;
  to: number;
  kind: IncomingKind;
}

/** Marks text that was just inserted. Positions are in the document after the transaction. */
export const addIncoming = StateEffect.define<{
  ranges: { from: number; to: number }[];
  kind: IncomingKind;
}>();

export const clearIncoming = StateEffect.define<IncomingKind>();

/** How long a reload's highlight stays before it starts to fade. */
export const FADE_AFTER_MS = 1500;

/** The effect that marks what `changes` inserted, or null if they only delete. */
export function incomingFor(changes: ChangeSet, kind: IncomingKind) {
  const ranges: { from: number; to: number }[] = [];
  changes.iterChanges((_fromA, _toA, fromB, toB) => {
    if (toB > fromB) ranges.push({ from: fromB, to: toB });
  });
  return ranges.length ? addIncoming.of({ ranges, kind }) : null;
}

// The native tooltip answers "why is this green?" for whoever hovers before reading the bar
const lineDeco = {
  persistent: Decoration.line({ class: 'cm-incoming', attributes: { title: 'Merged from disk' } }),
  fading: Decoration.line({
    class: 'cm-incoming cm-incoming-fading',
    attributes: { title: 'Reloaded from disk' },
  }),
};

/**
 * Where the line is shown from. With soft line breaks joined, the lines of a paragraph are
 * drawn as one, and CodeMirror only keeps the decoration of the first of them.
 */
function visualStart(state: EditorState, line: Line): number {
  const joined = state.field(joinSoftBreaks, false);
  let from = line.from;
  while (joined && from > 0) {
    const previous = state.doc.lineAt(from - 1);
    let isJoined = false;
    joined.between(previous.to, previous.to, (start) => {
      if (start === previous.to) isJoined = true;
    });
    if (!isJoined) break;
    from = previous.from;
  }
  return from;
}

/**
 * A line is highlighted when part of its text is inside a range. A range made only of line
 * breaks (a blank line inserted) marks nothing: there is no text to show, and which line a
 * break belongs to depends on how the change happened to be cut.
 */
function decorate(state: EditorState, ranges: Incoming[]): DecorationSet {
  const doc = state.doc;
  const lines = new Map<number, IncomingKind>();
  for (const r of ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) {
      const line = doc.line(n);
      if (Math.max(r.from, line.from) >= Math.min(r.to, line.to)) continue;
      const at = visualStart(state, line);
      // A merge's lines take precedence over a reload's fading ones
      if (lines.get(at) !== 'persistent') lines.set(at, r.kind);
    }
  }
  return Decoration.set(
    [...lines].map(([from, kind]) => lineDeco[kind].range(from)),
    true,
  );
}

interface Marks {
  ranges: Incoming[];
  decorations: DecorationSet;
}

export const incomingField = StateField.define<Marks>({
  create: () => ({ ranges: [], decorations: Decoration.none }),
  update(value, tr) {
    let ranges = value.ranges;
    if (tr.docChanged) {
      // Text typed at an edge stays outside, and a range whose text is gone (undo) disappears
      ranges = ranges.flatMap((r) => {
        const from = tr.changes.mapPos(r.from, 1);
        const to = tr.changes.mapPos(r.to, -1);
        return from < to ? [{ ...r, from, to }] : [];
      });
    }
    for (const e of tr.effects) {
      if (e.is(addIncoming))
        ranges = ranges.concat(e.value.ranges.map((r) => ({ ...r, kind: e.value.kind })));
      else if (e.is(clearIncoming)) ranges = ranges.filter((r) => r.kind !== e.value);
    }
    if (!ranges.length && !value.ranges.length) return value;
    // A reconfiguration may have switched soft line breaks on or off, which changes the lines
    if (ranges === value.ranges && !tr.reconfigured) return value;
    return { ranges, decorations: decorate(tr.state, ranges) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

export const hasIncoming = (state: EditorState, kind: IncomingKind) =>
  state.field(incomingField).ranges.some((r) => r.kind === kind);

/** Removes the highlight of the given kind, if there is any. */
export function dropIncoming(view: EditorView, kind: IncomingKind) {
  if (hasIncoming(view.state, kind)) view.dispatch({ effects: clearIncoming.of(kind) });
}

/** Fading highlights are removed a moment after they appear. */
const fadeOut = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined;

    constructor(readonly view: EditorView) {
      this.arm();
    }

    update() {
      this.arm();
    }

    arm() {
      if (this.timer !== undefined || !hasIncoming(this.view.state, 'fading')) return;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        dropIncoming(this.view, 'fading');
      }, FADE_AFTER_MS);
    }

    destroy() {
      clearTimeout(this.timer);
    }
  },
);

export const incomingLines = [incomingField, fadeOut];
