import { undo } from '@codemirror/commands';
import { EditorSelection, type EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { lineBreakFor, minimalReplacement, reloadTransaction } from './reload';
import { createState } from './setup';

/** What the replacement does, so the tests read as before → after. */
const apply = (prev: string, next: string) => {
  const r = minimalReplacement(prev, next);
  return r && prev.slice(0, r.from) + r.insert + prev.slice(r.to);
};

describe('minimalReplacement', () => {
  it('returns null for identical texts', () => {
    expect(minimalReplacement('same\ntext', 'same\ntext')).toBeNull();
    expect(minimalReplacement('', '')).toBeNull();
  });

  it('replaces only the part that differs', () => {
    expect(minimalReplacement('one two three', 'one 2 three')).toEqual({ from: 4, to: 7, insert: '2' });
  });

  it('inserts at the start and at the end', () => {
    expect(minimalReplacement('body', 'head\nbody')).toEqual({ from: 0, to: 0, insert: 'head\n' });
    expect(minimalReplacement('body', 'body\ntail')).toEqual({ from: 4, to: 4, insert: '\ntail' });
  });

  it('deletes', () => {
    expect(minimalReplacement('abcdef', 'abef')).toEqual({ from: 2, to: 4, insert: '' });
    expect(minimalReplacement('abc', '')).toEqual({ from: 0, to: 3, insert: '' });
  });

  it('replaces everything when nothing is shared', () => {
    expect(minimalReplacement('abc', 'xyz')).toEqual({ from: 0, to: 3, insert: 'xyz' });
  });

  it('does not let the prefix and the suffix overlap', () => {
    // "aa" -> "aaa": the shared prefix and suffix would both claim the same characters
    const r = minimalReplacement('aa', 'aaa');
    expect(apply('aa', 'aaa')).toBe('aaa');
    expect(r && r.to - r.from).toBeLessThanOrEqual(2);
    expect(apply('abab', 'ababab')).toBe('ababab');
  });

  it('never splits an emoji', () => {
    // 😀 and 😁 share their high surrogate; 😀 and 😃 are different characters in the same block
    for (const [prev, next] of [
      ['a😀b', 'a😁b'],
      ['😀', '😁'],
      ['x😀', 'x😀😁'],
      ['😀y', '😁y'],
    ]) {
      const r = minimalReplacement(prev, next);
      expect(r).not.toBeNull();
      const { from, to } = r as NonNullable<typeof r>;
      for (const pos of [from, to]) {
        if (pos > 0 && pos < prev.length) {
          const code = prev.charCodeAt(pos);
          expect(code >= 0xdc00 && code <= 0xdfff).toBe(false); // not on a low surrogate
        }
      }
      expect(apply(prev, next)).toBe(next);
    }
  });

  it('reproduces the new text for any pair (property check)', () => {
    const alphabet = ['a', 'b', '\n', ' ', '😀', 'é'];
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const word = () => Array.from({ length: rnd(8) }, () => alphabet[rnd(alphabet.length)]).join('');
    for (let i = 0; i < 500; i++) {
      const prev = word();
      const next = word();
      expect(apply(prev, next) ?? prev).toBe(next);
    }
  });
});

const doc = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n';
const opts = {};

/** The transaction is applied on top of the state, like the editor does. */
function reload(state: EditorState, content: string): EditorState {
  const tr = reloadTransaction(state, content);
  if (tr === null || tr === 'rebuild') throw new Error(`expected a transaction, got ${tr}`);
  return tr.state;
}

describe('reloadTransaction', () => {
  it('does nothing when the content is the same', () => {
    expect(reloadTransaction(createState(doc, opts), doc)).toBeNull();
  });

  it('keeps the cursor where it was in unchanged text', () => {
    const at = doc.indexOf('Second');
    const state = createState(doc, opts).update({ selection: { anchor: at } }).state;
    const next = reload(state, `Intro line.\n\n${doc}`);
    expect(next.selection.main.head).toBe(at + 'Intro line.\n\n'.length);
    expect(next.sliceDoc(next.selection.main.head, next.selection.main.head + 6)).toBe('Second');
  });

  it('keeps the cursor and the selection before the change untouched', () => {
    const state = createState(doc, opts).update({ selection: EditorSelection.range(2, 7) }).state;
    const next = reload(state, doc.replace('Second paragraph.', 'Second paragraph, rewritten.'));
    expect(next.selection.main.from).toBe(2);
    expect(next.selection.main.to).toBe(7);
  });

  it('changes the document to exactly the new content', () => {
    const content = doc.replace('First', 'Changed');
    expect(reload(createState(doc, opts), content).sliceDoc()).toBe(content);
  });

  it('is undone in one step, restoring the previous text', () => {
    let state = createState(doc, opts);
    // Typing before the reload must not be swallowed by the same undo step
    state = state.update({ changes: { from: 0, insert: 'x' } }).state;
    const typed = state.sliceDoc();
    state = reload(state, `${typed}\nextra line\n`);
    expect(state.sliceDoc()).toBe(`${typed}\nextra line\n`);

    undo({
      state,
      dispatch: (tr: Transaction) => {
        state = tr.state;
      },
    });
    expect(state.sliceDoc()).toBe(typed);
  });

  it('keeps \\r\\n when the file already used it', () => {
    const crlf = 'one\r\ntwo\r\n';
    const content = 'one\r\nchanged\r\nthree\r\n';
    const next = reload(createState(crlf, opts), content);
    expect(next.sliceDoc()).toBe(content);
  });

  it('keeps a lone \\n as text inside a \\r\\n file', () => {
    const crlf = 'one\r\ntwo\r\n';
    const content = 'one\r\ntw\no\r\n';
    const next = reload(createState(crlf, opts), content);
    expect(next.sliceDoc()).toBe(content);
    expect(next.doc.lines).toBe(3); // the lone \n did not become a line break
  });

  it('asks for a rebuild when the line separator changes', () => {
    expect(reloadTransaction(createState('one\ntwo\n', opts), 'one\r\ntwo\r\n')).toBe('rebuild');
    expect(reloadTransaction(createState('one\r\ntwo\r\n', opts), 'one\ntwo\n')).toBe('rebuild');
  });

  it('a rebuilt state saves the new line separator', () => {
    const content = 'one\r\ntwo\r\n';
    expect(createState(content, opts).sliceDoc()).toBe(content);
    expect(lineBreakFor(content)).toBe('\r\n');
    expect(lineBreakFor('one\ntwo')).toBe('\n');
  });
});
