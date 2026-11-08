import { undo } from '@codemirror/commands';
import type { EditorState, Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { mergeChanges } from './merge';
import { createState } from './setup';

const base = '# Title\n\nFirst.\n\nSecond.\n\nThird.\n';

/** The document after the user typed: replaces `find` with `insert`. */
function edit(state: EditorState, find: string, insert: string): EditorState {
  // toString joins lines with "\n", so an index into it is a document position (even with \r\n)
  const from = state.doc.toString().indexOf(find);
  if (from < 0) throw new Error(`"${find}" is not in the document`);
  return state.update({ changes: { from, to: from + find.length, insert } }).state;
}

const mine = (doc: string, ...edits: [string, string][]) =>
  edits.reduce((state, [find, insert]) => edit(state, find, insert), createState(doc, {}));

/** Applies the transaction the merge answers, like the editor does. */
function merged(state: EditorState, from: string, theirs: string): EditorState {
  const result = mergeChanges(state, from, theirs);
  if (result === null || result === 'conflict') throw new Error(`expected a transaction, got ${result}`);
  return (result as Transaction).state;
}

describe('mergeChanges', () => {
  it('combines changes made on different lines', () => {
    const state = mine(base, ['First.', 'First, edited by me.']);
    const next = merged(state, base, base.replace('Third.', 'Third, rewritten.'));
    expect(next.sliceDoc()).toBe('# Title\n\nFirst, edited by me.\n\nSecond.\n\nThird, rewritten.\n');
  });

  it('leaves the characters the user typed as they were', () => {
    const state = mine(base, ['First.', 'First  with   odd spacing *and* markers.']);
    const next = merged(state, base, base.replace('# Title', '# New title'));
    expect(next.sliceDoc()).toContain('First  with   odd spacing *and* markers.');
    expect(next.sliceDoc().startsWith('# New title\n')).toBe(true);
  });

  it('merges lines inserted and deleted by the other side', () => {
    const state = mine(base, ['First.', 'First, edited.']);
    const theirs = base.replace('Second.', 'Added.\n\nSecond.').replace('\n\nThird.', '');
    expect(merged(state, base, theirs).sliceDoc()).toBe('# Title\n\nFirst, edited.\n\nAdded.\n\nSecond.\n');
  });

  it('merges several separate changes from the other side', () => {
    const state = mine(base, ['Second.', 'Second, edited.']);
    const theirs = base.replace('# Title', '# Name').replace('Third.', 'Third!');
    expect(merged(state, base, theirs).sliceDoc()).toBe('# Name\n\nFirst.\n\nSecond, edited.\n\nThird!\n');
  });

  it('keeps a change of one word narrow, so a cursor in the same line stays put', () => {
    let state = mine(base, ['First.', 'First paragraph.']);
    state = state.update({ selection: { anchor: state.sliceDoc().indexOf('paragraph') } }).state;
    const next = merged(state, base, base.replace('Third.', 'Third, rewritten.'));
    const head = next.selection.main.head;
    expect(next.sliceDoc(head, head + 9)).toBe('paragraph');
  });

  it('keeps the cursor in the user text when the other side changes lines above it', () => {
    let state = mine(base, ['Third.', 'Third, edited.']);
    state = state.update({ selection: { anchor: state.sliceDoc().indexOf('edited') } }).state;
    const next = merged(state, base, base.replace('# Title', '# A much longer title than before'));
    const head = next.selection.main.head;
    expect(next.sliceDoc(head, head + 6)).toBe('edited');
  });

  describe('conflicts', () => {
    it('are reported when both sides changed the same line', () => {
      const state = mine(base, ['Second.', 'Second, mine.']);
      expect(mergeChanges(state, base, base.replace('Second.', 'Second, theirs.'))).toBe('conflict');
    });

    it('are reported for neighbouring lines', () => {
      const state = mine(base, ['First.', 'First, mine.']);
      // The blank line right after "First."
      expect(mergeChanges(state, base, base.replace('First.\n\n', 'First.\ntheirs\n'))).toBe('conflict');
    });

    it('are not reported when one unchanged line separates the changes', () => {
      const state = mine(base, ['First.', 'First, mine.']);
      expect(mergeChanges(state, base, base.replace('Second.', 'Second, theirs.'))).not.toBe('conflict');
    });

    it('are reported for different lines inserted at the same point', () => {
      const state = mine(base, ['Second.', 'Mine.\n\nSecond.']);
      expect(mergeChanges(state, base, base.replace('Second.', 'Theirs.\n\nSecond.'))).toBe('conflict');
    });

    it('are reported when one change of the other side clashes, even if others do not', () => {
      const state = mine(base, ['Second.', 'Second, mine.']);
      const theirs = base.replace('# Title', '# Name').replace('Second.', 'Second, theirs.');
      expect(mergeChanges(state, base, theirs)).toBe('conflict');
    });

    it('are reported when the other side changes a line the user deleted', () => {
      const state = mine(base, ['Second.\n\n', '']);
      expect(mergeChanges(state, base, base.replace('Second.', 'Second, theirs.'))).toBe('conflict');
    });

    it('are reported when the other side converts the line endings', () => {
      const state = mine(base, ['First.', 'First, mine.']);
      expect(mergeChanges(state, base, base.replaceAll('\n', '\r\n'))).toBe('conflict');
    });

    it('are reported when the document has \\r\\n and the file now has \\n', () => {
      const crlf = base.replaceAll('\n', '\r\n');
      const state = mine(crlf, ['First.', 'First, mine.']);
      expect(mergeChanges(state, crlf, base)).toBe('conflict');
    });
  });

  describe('the same change on both sides', () => {
    it('is not applied twice, and is not a conflict', () => {
      const state = mine(base, ['Third.', 'Third, rewritten.']);
      expect(mergeChanges(state, base, base.replace('Third.', 'Third, rewritten.'))).toBeNull();
    });

    it('does not stop the rest of the other side from merging', () => {
      const state = mine(base, ['Third.', 'Third, rewritten.']);
      const theirs = base.replace('Third.', 'Third, rewritten.').replace('# Title', '# Name');
      expect(merged(state, base, theirs).sliceDoc()).toBe(
        '# Name\n\nFirst.\n\nSecond.\n\nThird, rewritten.\n',
      );
    });

    it('is not applied twice when it is an inserted line', () => {
      const added = '# Title\n\nNew line.\n\nFirst.\n\nSecond.\n\nThird.\n';
      const state = mine(base, ['First.', 'New line.\n\nFirst.']);
      expect(mergeChanges(state, base, added)).toBeNull();
    });
  });

  it('answers null when the other side changed nothing the document lacks', () => {
    expect(mergeChanges(mine(base, ['First.', 'Mine.']), base, base)).toBeNull();
  });

  it('is undone in one step, leaving the user text as it was before the merge', () => {
    let state = mine(base, ['First.', 'First, mine.']);
    const before = state.sliceDoc();
    state = merged(state, base, base.replace('Third.', 'Third, rewritten.'));
    expect(state.sliceDoc()).not.toBe(before);
    undo({
      state,
      dispatch: (tr: Transaction) => {
        state = tr.state;
      },
    });
    expect(state.sliceDoc()).toBe(before);
  });

  describe('\\r\\n files', () => {
    const crlf = 'one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n';

    it('merges and keeps \\r\\n', () => {
      const state = mine(crlf, ['one', 'ONE']);
      const next = merged(state, crlf, crlf.replace('five', 'FIVE'));
      expect(next.sliceDoc()).toBe('ONE\r\ntwo\r\nthree\r\nfour\r\nFIVE\r\n');
    });

    it('merges lines inserted by the other side', () => {
      const state = mine(crlf, ['five', 'five, mine']);
      const next = merged(state, crlf, crlf.replace('two\r\n', 'two\r\nx\r\ny\r\n'));
      expect(next.sliceDoc()).toBe('one\r\ntwo\r\nx\r\ny\r\nthree\r\nfour\r\nfive, mine\r\n');
    });

    it('keeps a lone \\n inside a line as text', () => {
      const withLone = 'one\r\ntw\no\r\nthree\r\nfour\r\n';
      const state = mine(withLone, ['four', 'FOUR']);
      const next = merged(state, withLone, withLone.replace('one', 'ONE'));
      expect(next.sliceDoc()).toBe('ONE\r\ntw\no\r\nthree\r\nFOUR\r\n');
      expect(next.doc.lines).toBe(5); // the lone \n did not become a line break
    });
  });

  describe('a file without a final line break', () => {
    it('merges a change at the top with one at the last line', () => {
      const doc = 'a\nb\nc\nd\ne';
      const state = mine(doc, ['e', 'E']);
      expect(merged(state, doc, doc.replace('a', 'A')).sliceDoc()).toBe('A\nb\nc\nd\nE');
    });

    it('treats a line appended after the last line as touching it', () => {
      const doc = 'a\nb\nc';
      const state = mine(doc, ['c', 'C']);
      expect(mergeChanges(state, doc, `${doc}\nd`)).toBe('conflict');
    });
  });

  it('gives the combination of both sides for any non-touching pair of edits (property check)', () => {
    let seed = 5;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const lines = Array.from({ length: 8 + rnd(10) }, (_, i) => `line ${i}`);
      const mineAt = new Set<number>();
      const theirsAt = new Set<number>();
      for (let i = 0; i < lines.length; i++) {
        const pick = rnd(6);
        const tooClose = (set: Set<number>) => set.has(i - 1) || set.has(i) || set.has(i + 1);
        if (pick === 0 && !tooClose(theirsAt)) mineAt.add(i);
        else if (pick === 1 && !tooClose(mineAt)) theirsAt.add(i);
      }
      const make = (at: Set<number>, who: string) => lines.map((l, i) => (at.has(i) ? `${l} (${who})` : l));
      const doc = `${lines.join('\n')}\n`;
      const state = createState(`${make(mineAt, 'mine').join('\n')}\n`, {});
      const theirs = `${make(theirsAt, 'theirs').join('\n')}\n`;
      const both = lines.map((l, i) =>
        mineAt.has(i) ? `${l} (mine)` : theirsAt.has(i) ? `${l} (theirs)` : l,
      );
      const result = mergeChanges(state, doc, theirs);
      if (theirsAt.size === 0) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBe('conflict');
        expect((result as Transaction).state.sliceDoc()).toBe(`${both.join('\n')}\n`);
      }
    }
  });
});
