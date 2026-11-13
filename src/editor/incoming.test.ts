import { undo } from '@codemirror/commands';
import type { EditorState, Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { clearIncoming, hasIncoming, incomingField } from './incoming';
import { mergeChanges } from './merge';
import { reloadTransaction } from './reload';
import { createState } from './setup';

const base = '# Title\n\nFirst.\n\nSecond.\n\nThird.\n\nFourth.\n';

/** Line numbers (1-based) that carry the highlight, with the class they got. */
function marked(state: EditorState): [number, string][] {
  const out: [number, string][] = [];
  for (const it = state.field(incomingField).decorations.iter(); it.value; it.next()) {
    out.push([state.doc.lineAt(it.from).number, it.value.spec.class]);
  }
  return out;
}
const lines = (state: EditorState) => marked(state).map(([n]) => n);

const edit = (state: EditorState, find: string, insert: string) => {
  const from = state.doc.toString().indexOf(find);
  return state.update({ changes: { from, to: from + find.length, insert } }).state;
};

function merge(state: EditorState, from: string, theirs: string): EditorState {
  const tr = mergeChanges(state, from, theirs);
  if (tr === null || tr === 'conflict') throw new Error(`expected a transaction, got ${tr}`);
  return tr.state;
}

const undone = (state: EditorState) => {
  let next = state;
  undo({
    state,
    dispatch: (tr: Transaction) => {
      next = tr.state;
    },
  });
  return next;
};

describe('incoming lines', () => {
  it('start empty', () => {
    expect(marked(createState(base, {}))).toEqual([]);
  });

  it('after a merge, mark the lines that came from disk and no others', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    const next = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    expect(marked(next)).toEqual([[7, 'cm-incoming']]);
    expect(next.doc.line(7).text).toBe('Third, theirs.');
  });

  it('mark every line of an inserted paragraph', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    const next = merge(state, base, base.replace('Fourth.', 'New one.\nAnd another.\n\nFourth.'));
    expect(lines(next).map((n) => next.doc.line(n).text)).toEqual(['New one.', 'And another.']);
  });

  it('accumulate across merges', () => {
    let state = edit(createState(base, {}), 'First.', 'First, mine.');
    state = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    const second = base.replace('Third.', 'Third, theirs.');
    state = merge(state, second, second.replace('# Title', '# Their title'));
    expect(lines(state).map((n) => state.doc.line(n).text)).toEqual(['# Their title', 'Third, theirs.']);
  });

  it('follow their text when the document changes above', () => {
    let state = edit(createState(base, {}), 'First.', 'First, mine.');
    state = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    state = edit(state, '# Title', '# Title\n\nAn extra paragraph.');
    expect(lines(state).map((n) => state.doc.line(n).text)).toEqual(['Third, theirs.']);
  });

  it('stay when the user types inside, and do not grow when typing at the edges', () => {
    let state = edit(createState(base, {}), 'First.', 'First, mine.');
    state = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    state = edit(state, 'theirs', 'theirs and mine');
    expect(lines(state)).toHaveLength(1);
    const line = state.doc.line(lines(state)[0]);
    // Typing at the very end of the range is outside it; a new line after it is not marked
    state = state.update({ changes: { from: line.to, insert: '\nTyped after.' } }).state;
    expect(lines(state).map((n) => state.doc.line(n).text)).toEqual(['Third, theirs and mine.']);
  });

  it('are gone after undoing the merge', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    const next = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    expect(lines(next)).toHaveLength(1);
    const back = undone(next);
    expect(back.sliceDoc()).toBe(state.sliceDoc());
    expect(marked(back)).toEqual([]);
  });

  it('are not added by a change that only deletes lines', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    const next = merge(state, base, base.replace('\n\nFourth.', ''));
    expect(next.sliceDoc()).not.toContain('Fourth.');
    expect(marked(next)).toEqual([]);
  });

  it('do not mark a blank line that was only inserted', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    const next = merge(state, base, base.replace('Third.', '\nThird.'));
    expect(marked(next)).toEqual([]);
  });

  it('drop the persistent kind and leave the fading ones', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    // A merge (persistent) followed by a reload of what is now the whole file (fading)
    let next = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    const reload = reloadTransaction(next, next.sliceDoc().replace('Fourth.', 'Fourth, reloaded.'));
    if (reload === null || reload === 'rebuild') throw new Error('expected a transaction');
    next = reload.state;
    expect(marked(next).map(([, cls]) => cls)).toEqual(['cm-incoming', 'cm-incoming cm-incoming-fading']);

    next = next.update({ effects: clearIncoming.of('persistent') }).state;
    expect(hasIncoming(next, 'persistent')).toBe(false);
    expect(marked(next)).toEqual([[9, 'cm-incoming cm-incoming-fading']]);

    next = next.update({ effects: clearIncoming.of('fading') }).state;
    expect(marked(next)).toEqual([]);
  });

  it('carry a tooltip saying where the line came from', () => {
    const state = edit(createState(base, {}), 'First.', 'First, mine.');
    let next = merge(state, base, base.replace('Third.', 'Third, theirs.'));
    const reload = reloadTransaction(next, next.sliceDoc().replace('Fourth.', 'Fourth, reloaded.'));
    if (reload === null || reload === 'rebuild') throw new Error('expected a transaction');
    next = reload.state;
    const titles: string[] = [];
    for (const it = next.field(incomingField).decorations.iter(); it.value; it.next()) {
      titles.push(it.value.spec.attributes.title);
    }
    expect(titles).toEqual(['Merged from disk', 'Reloaded from disk']);
  });

  it('are fading after a reload', () => {
    const tr = reloadTransaction(createState(base, {}), base.replace('Second.', 'Second, reloaded.'));
    if (tr === null || tr === 'rebuild') throw new Error('expected a transaction');
    expect(marked(tr.state)).toEqual([[5, 'cm-incoming cm-incoming-fading']]);
  });

  it('are not added by a reload that only deletes', () => {
    const tr = reloadTransaction(createState(base, {}), base.replace('\n\nFourth.', ''));
    if (tr === null || tr === 'rebuild') throw new Error('expected a transaction');
    expect(marked(tr.state)).toEqual([]);
  });

  it('mark the first line of a joined paragraph when a later one changed', () => {
    const wrapped = 'First line\nsecond line\nthird line\n\nOther paragraph.\n';
    const state = createState(wrapped, { reading: true, readingJoin: true });
    const tr = reloadTransaction(state, wrapped.replace('second', 'changed second'));
    if (tr === null || tr === 'rebuild') throw new Error('expected a transaction');
    expect(lines(tr.state)).toEqual([1]);
    // ...and the line itself when the breaks are not joined
    const kept = createState(wrapped, { reading: true, readingJoin: false });
    const tr2 = reloadTransaction(kept, wrapped.replace('second', 'changed second'));
    if (tr2 === null || tr2 === 'rebuild') throw new Error('expected a transaction');
    expect(lines(tr2.state)).toEqual([2]);
  });

  it('work in a \\r\\n document', () => {
    const crlf = base.replaceAll('\n', '\r\n');
    const state = edit(createState(crlf, {}), 'First.', 'First, mine.');
    const next = merge(state, crlf, crlf.replace('Third.', 'Third, theirs.'));
    expect(lines(next).map((n) => next.doc.line(n).text)).toEqual(['Third, theirs.']);
  });
});
