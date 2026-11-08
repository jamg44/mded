import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { diffKeys, diffLines, type LineHunk, linesOf } from './linediff';

const text = (s: string, sep = '\n') => Text.of(s.split(sep));

/** Rebuilds `b` from `a` and the hunks, to check that the hunks describe the whole difference. */
function applyHunks(a: string, b: string, sep = '\n'): string {
  const A = text(a, sep);
  const B = text(b, sep);
  const la = linesOf(A);
  const lb = linesOf(B);
  let out = '';
  let cursor = 0;
  for (const h of diffLines(A, B)) {
    out +=
      A.sliceString(cursor, la.starts[h.fromA], sep) +
      B.sliceString(lb.starts[h.fromB], lb.starts[h.toB], sep);
    cursor = la.starts[h.toA];
  }
  return out + A.sliceString(cursor, A.length, sep);
}

const hunks = (a: string, b: string, sep = '\n') => diffLines(text(a, sep), text(b, sep));

describe('linesOf', () => {
  it('has no lines for an empty document', () => {
    expect(linesOf(text('')).keys).toEqual([]);
  });

  it('does not count what follows the final line break as a line', () => {
    expect(linesOf(text('a\nb\n')).keys).toHaveLength(2);
    expect(linesOf(text('a\nb')).keys).toHaveLength(2);
    expect(linesOf(text('a\n\n')).keys).toHaveLength(2);
  });

  it('records where lines start, and ends with the length of the document', () => {
    expect(linesOf(text('ab\nc\n')).starts).toEqual([0, 3, 5]);
    expect(linesOf(text('ab\nc')).starts).toEqual([0, 3, 4]);
  });
});

describe('diffLines', () => {
  it('finds nothing in identical texts', () => {
    expect(hunks('a\nb\nc\n', 'a\nb\nc\n')).toEqual([]);
    expect(hunks('', '')).toEqual([]);
  });

  it('finds one changed line', () => {
    expect(hunks('a\nb\nc\n', 'a\nB\nc\n')).toEqual([{ fromA: 1, toA: 2, fromB: 1, toB: 2 }]);
  });

  it('finds lines inserted at the start, the middle and the end', () => {
    expect(hunks('b\nc\n', 'a\nb\nc\n')).toEqual([{ fromA: 0, toA: 0, fromB: 0, toB: 1 }]);
    expect(hunks('a\nc\n', 'a\nb\nc\n')).toEqual([{ fromA: 1, toA: 1, fromB: 1, toB: 2 }]);
    expect(hunks('a\nb\n', 'a\nb\nc\n')).toEqual([{ fromA: 2, toA: 2, fromB: 2, toB: 3 }]);
  });

  it('finds lines deleted at the start, the middle and the end', () => {
    expect(hunks('a\nb\nc\n', 'b\nc\n')).toEqual([{ fromA: 0, toA: 1, fromB: 0, toB: 0 }]);
    expect(hunks('a\nb\nc\n', 'a\nc\n')).toEqual([{ fromA: 1, toA: 2, fromB: 1, toB: 1 }]);
    expect(hunks('a\nb\nc\n', 'a\nb\n')).toEqual([{ fromA: 2, toA: 3, fromB: 2, toB: 2 }]);
  });

  it('keeps separate changes apart and joins touching ones', () => {
    expect(hunks('1\n2\n3\n4\n5\n', '1\nx\n3\ny\n5\n')).toHaveLength(2);
    expect(hunks('1\n2\n3\n4\n5\n', '1\nx\ny\n4\n5\n')).toEqual([{ fromA: 1, toA: 3, fromB: 1, toB: 3 }]);
  });

  it('turns a file with everything different into one hunk', () => {
    expect(hunks('a\nb\n', 'x\ny\nz\n')).toEqual([{ fromA: 0, toA: 2, fromB: 0, toB: 3 }]);
  });

  describe('final line break', () => {
    it('adding it changes only the last line', () => {
      expect(hunks('a\nb', 'a\nb\n')).toEqual([{ fromA: 1, toA: 2, fromB: 1, toB: 2 }]);
      expect(applyHunks('a\nb', 'a\nb\n')).toBe('a\nb\n');
    });

    it('removing it changes only the last line', () => {
      expect(hunks('a\nb\n', 'a\nb')).toEqual([{ fromA: 1, toA: 2, fromB: 1, toB: 2 }]);
      expect(applyHunks('a\nb\n', 'a\nb')).toBe('a\nb');
    });

    it('appending a line to a file that has it is a pure insertion', () => {
      expect(hunks('a\nb\n', 'a\nb\nc\n')).toEqual([{ fromA: 2, toA: 2, fromB: 2, toB: 3 }]);
    });

    it('appending a line to a file without it changes the former last line', () => {
      expect(hunks('a\nb', 'a\nb\nc')).toEqual([{ fromA: 1, toA: 2, fromB: 1, toB: 3 }]);
      expect(applyHunks('a\nb', 'a\nb\nc')).toBe('a\nb\nc');
    });

    it('does not mix a lone line break at the end with a blank line', () => {
      expect(hunks('a\n', 'a\n\n')).toEqual([{ fromA: 1, toA: 1, fromB: 1, toB: 2 }]);
    });
  });

  describe('\\r\\n files', () => {
    const sep = '\r\n';

    it('compares lines without their separator and reports line indexes', () => {
      expect(hunks('a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\n', sep)).toEqual([
        { fromA: 1, toA: 2, fromB: 1, toB: 2 },
      ]);
    });

    it('rebuilds the text with \\r\\n', () => {
      expect(applyHunks('a\r\nb\r\n', 'a\r\nx\r\ny\r\nb\r\n', sep)).toBe('a\r\nx\r\ny\r\nb\r\n');
    });

    it('treats a lone \\n inside a line as part of its text', () => {
      const prev = text('a\r\nb\nc\r\nd\r\n', sep);
      expect(linesOf(prev).keys).toHaveLength(3);
      expect(hunks('a\r\nb\nc\r\nd\r\n', 'a\r\nb\nC\r\nd\r\n', sep)).toEqual([
        { fromA: 1, toA: 2, fromB: 1, toB: 2 },
      ]);
    });
  });

  it('is the same for any pair of texts as a reference diff (property check)', () => {
    let seed = 11;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const lines = () => Array.from({ length: rnd(12) }, () => 'abc'[rnd(3)]);
    // Longest common subsequence by dynamic programming: the fewest edits are n + m - 2 * lcs
    const lcs = (a: string[], b: string[]) => {
      const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
      for (let i = a.length - 1; i >= 0; i--)
        for (let j = b.length - 1; j >= 0; j--)
          t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
      return t[0][0];
    };
    for (let i = 0; i < 400; i++) {
      const a = lines();
      const b = lines();
      const found = diffKeys(a, b);
      let edits = 0;
      let rebuilt: string[] = [];
      let cursor = 0;
      for (const h of found) {
        edits += h.toA - h.fromA + (h.toB - h.fromB);
        rebuilt = rebuilt.concat(a.slice(cursor, h.fromA), b.slice(h.fromB, h.toB));
        cursor = h.toA;
      }
      rebuilt = rebuilt.concat(a.slice(cursor));
      expect(rebuilt).toEqual(b);
      expect(edits).toBe(a.length + b.length - 2 * lcs(a, b));
      // hunks come in order and never touch, so each one is a separate change
      found.slice(1).forEach((h, n) => {
        const before: LineHunk = found[n];
        expect(h.fromA).toBeGreaterThan(before.toA);
      });
    }
  });

  it('handles a file of several thousand lines with scattered changes quickly', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[100] = 'changed';
    b.splice(2500, 0, 'inserted');
    b.splice(4000, 1);
    const started = performance.now();
    const found = diffKeys(a, b);
    expect(performance.now() - started).toBeLessThan(500);
    expect(found).toHaveLength(3);
  });

  it('falls back to one hunk when the files have nothing in common and are huge', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`);
    const started = performance.now();
    expect(diffKeys(a, b)).toEqual([{ fromA: 0, toA: 3000, fromB: 0, toB: 3000 }]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
