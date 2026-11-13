import { describe, expect, it } from 'vitest';
import { readingMode } from './reading';
import { createState } from './setup';
import { joinSoftBreaks } from './softbreaks';

const doc = 'one\ntwo\n\nthree\n';

describe('modes', () => {
  it('edit mode is writable and never joins lines, whatever the join option says', () => {
    const state = createState(doc, { readingJoin: true });
    expect(state.readOnly).toBe(false);
    expect(state.facet(readingMode)).toBe(false);
    expect(state.field(joinSoftBreaks, false)).toBeUndefined();
  });

  it('reading mode is read-only and does not join lines unless asked', () => {
    const state = createState(doc, { reading: true });
    expect(state.readOnly).toBe(true);
    expect(state.facet(readingMode)).toBe(true);
    expect(state.field(joinSoftBreaks, false)).toBeUndefined();
  });

  it('reading mode joins lines when the option is on', () => {
    const state = createState(doc, { reading: true, readingJoin: true });
    expect(state.readOnly).toBe(true);
    expect(state.field(joinSoftBreaks, false)).toBeDefined();
  });
});
