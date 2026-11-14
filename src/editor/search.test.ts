import { redo, undo } from '@codemirror/commands';
import { SearchQuery, setSearchQuery } from '@codemirror/search';
import type { EditorState, TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import {
  COUNT_CAP,
  closeSearchPanel,
  countLabel,
  countMatches,
  findNext,
  findPrevious,
  openFind,
  openReplace,
  replaceAll,
  replaceNext,
  replaceShown,
  revealRanges,
  searchPanelOpen,
  searchStateChanged,
  toggleReplace,
} from './search';
import { createState } from './setup';

/**
 * The commands only need a state, `dispatch`, and to find no panel in the DOM: this stands in
 * for a view, so they can run here without a browser (the panel itself is covered by e2e).
 */
function fakeView(state: EditorState) {
  const view = {
    state,
    dispatch(...specs: TransactionSpec[]) {
      view.state = view.state.update(...specs).state;
    },
    plugin: () => null,
    dom: { querySelector: () => null },
  };
  return view as unknown as EditorView;
}

function searching(doc: string, search: string, opts: Parameters<typeof createState>[1] = {}) {
  const view = fakeView(createState(doc, opts));
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search })) });
  return view;
}

const selected = (view: EditorView) => {
  const { from, to } = view.state.selection.main;
  return [from, to];
};

describe('stepping through matches', () => {
  const doc = 'cat dog cat bird cat';

  it('goes to the next match, then the next, and wraps around after the last', () => {
    const view = searching(doc, 'cat');
    const visited: number[][] = [];
    for (let i = 0; i < 4; i++) {
      expect(findNext(view)).toBe(true);
      visited.push(selected(view));
    }
    expect(visited).toEqual([
      [0, 3],
      [8, 11],
      [17, 20],
      [0, 3],
    ]);
  });

  it('goes to the previous match and wraps around before the first', () => {
    const view = searching(doc, 'cat');
    findNext(view);
    expect(selected(view)).toEqual([0, 3]);
    const visited: number[][] = [];
    for (let i = 0; i < 3; i++) {
      expect(findPrevious(view)).toBe(true);
      visited.push(selected(view));
    }
    expect(visited).toEqual([
      [17, 20],
      [8, 11],
      [0, 3],
    ]);
  });

  it('starts from the caret', () => {
    const view = searching(doc, 'cat');
    view.dispatch({ selection: { anchor: 5 } });
    findNext(view);
    expect(selected(view)).toEqual([8, 11]);
  });

  it('does nothing to the text', () => {
    const view = searching(doc, 'cat');
    findNext(view);
    findPrevious(view);
    expect(view.state.sliceDoc()).toBe(doc);
  });

  it('is case-insensitive unless asked otherwise', () => {
    const view = searching('Markdown markdown', 'markdown');
    findNext(view);
    findNext(view);
    expect(selected(view)).toEqual([9, 17]);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'markdown', caseSensitive: true })),
    });
    view.dispatch({ selection: { anchor: 0 } });
    findNext(view);
    expect(selected(view)).toEqual([9, 17]);
  });
});

describe('opening the panel', () => {
  it('opens it', () => {
    const view = fakeView(createState('text', {}));
    expect(searchPanelOpen(view.state)).toBe(false);
    openFind(view);
    expect(searchPanelOpen(view.state)).toBe(true);
  });

  it('Find and Replace opens it while editing', () => {
    const view = fakeView(createState('text', {}));
    expect(openReplace(view)).toBe(true);
    expect(searchPanelOpen(view.state)).toBe(true);
  });

  it('Find and Replace does nothing while reading', () => {
    const view = fakeView(createState('text', { reading: true }));
    expect(openReplace(view)).toBe(false);
    expect(searchPanelOpen(view.state)).toBe(false);
  });
});

describe('counting matches', () => {
  const doc = 'cat dog cat bird cat';
  const query = (view: EditorView, config: ConstructorParameters<typeof SearchQuery>[0]) =>
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery(config)) });

  it('counts the whole document and says which match is selected', () => {
    const view = searching(doc, 'cat');
    findNext(view);
    findNext(view);
    expect(countMatches(view.state)).toEqual({ total: 3, capped: false, index: 2 });
  });

  it('has no position when the selection is not on a match', () => {
    const view = searching(doc, 'cat');
    view.dispatch({ selection: { anchor: 5 } });
    expect(countMatches(view.state)).toEqual({ total: 3, capped: false, index: null });
    // Selecting only part of a match is not selecting the match
    view.dispatch({ selection: { anchor: 0, head: 2 } });
    expect(countMatches(view.state)?.index).toBeNull();
  });

  it('counts zero when nothing matches', () => {
    const view = searching(doc, 'zebra');
    expect(countMatches(view.state)).toEqual({ total: 0, capped: false, index: null });
  });

  it('has nothing to count for an empty search or an invalid regular expression', () => {
    const view = searching(doc, '');
    expect(countMatches(view.state)).toBeNull();
    query(view, { search: '(', regexp: true });
    expect(countMatches(view.state)).toBeNull();
  });

  it('follows the options', () => {
    const view = searching('Cat cat CAT', 'cat');
    expect(countMatches(view.state)?.total).toBe(3);
    query(view, { search: 'cat', caseSensitive: true });
    expect(countMatches(view.state)?.total).toBe(1);
    query(view, { search: String.raw`c\w+`, regexp: true });
    expect(countMatches(view.state)?.total).toBe(3);
    query(view, { search: String.raw`c\w+`, regexp: true, caseSensitive: true });
    expect(countMatches(view.state)?.total).toBe(1);
  });

  it('does not count zero-width matches', () => {
    const view = searching('abc', 'x*');
    query(view, { search: 'x*', regexp: true });
    expect(countMatches(view.state)).toEqual({ total: 0, capped: false, index: null });
  });

  it('stops at the cap', () => {
    const exactly = searching('a'.repeat(COUNT_CAP), 'a');
    expect(countMatches(exactly.state)).toEqual({ total: COUNT_CAP, capped: false, index: null });
    const more = searching('a'.repeat(COUNT_CAP + 50), 'a');
    expect(countMatches(more.state)).toEqual({ total: COUNT_CAP, capped: true, index: null });
  });
});

describe('the counter text', () => {
  it('says the position and the total', () => {
    expect(countLabel({ total: 7, capped: false, index: 3 })).toBe('3 of 7');
  });
  it('says only the total when the selection is not on a match', () => {
    expect(countLabel({ total: 7, capped: false, index: null })).toBe('7 matches');
    expect(countLabel({ total: 1, capped: false, index: null })).toBe('1 match');
  });
  it('says there are none', () => {
    expect(countLabel({ total: 0, capped: false, index: null })).toBe('No matches');
  });
  it('says nothing without a search', () => {
    expect(countLabel(null)).toBe('');
  });
  it('marks a capped total', () => {
    expect(countLabel({ total: COUNT_CAP, capped: true, index: null })).toBe('9999+ matches');
    expect(countLabel({ total: COUNT_CAP, capped: true, index: 4 })).toBe('4 of 9999+');
  });
});

describe('the matches that reveal markers', () => {
  const doc = 'a cat, a dog, a cat';
  const all = [{ from: 0, to: doc.length }];

  it('are the matches in view, while the panel is open', () => {
    const view = searching(doc, 'cat');
    openFind(view);
    expect(revealRanges(view.state, all)).toEqual([
      { from: 2, to: 5 },
      { from: 16, to: 19 },
    ]);
  });

  it('are none while the panel is closed, even with a search typed', () => {
    const view = searching(doc, 'cat');
    expect(searchPanelOpen(view.state)).toBe(false);
    expect(revealRanges(view.state, all)).toEqual([]);
  });

  it('are none for an empty search or an invalid regular expression', () => {
    const view = searching(doc, '');
    openFind(view);
    expect(revealRanges(view.state, all)).toEqual([]);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '(', regexp: true })) });
    expect(revealRanges(view.state, all)).toEqual([]);
  });

  it('are only those near the window', () => {
    const far = `cat${' '.repeat(2000)}cat`;
    const view = searching(far, 'cat');
    openFind(view);
    expect(revealRanges(view.state, [{ from: 0, to: 10 }])).toEqual([{ from: 0, to: 3 }]);
  });

  it('are listed once when the windows overlap', () => {
    const view = searching(doc, 'cat');
    openFind(view);
    const twice = [
      { from: 0, to: 10 },
      { from: 5, to: 15 },
    ];
    expect(revealRanges(view.state, twice)).toHaveLength(2);
  });

  it('leave out zero-width matches', () => {
    const view = searching('abc', 'x*');
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'x*', regexp: true })) });
    openFind(view);
    expect(revealRanges(view.state, [{ from: 0, to: 3 }])).toEqual([]);
  });

  it('are worked out again when the panel opens or the query changes, and not otherwise', () => {
    const view = searching(doc, 'cat');
    const before = view.state;
    openFind(view);
    expect(searchStateChanged(before, view.state)).toBe(true);
    const open = view.state;
    view.dispatch({ selection: { anchor: 3 } });
    expect(searchStateChanged(open, view.state)).toBe(false);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'dog' })) });
    expect(searchStateChanged(open, view.state)).toBe(true);
  });
});

describe('replacing', () => {
  const doc = 'cat dog cat bird cat';
  const replacing = (
    text: string,
    search: string,
    replace: string,
    opts: Parameters<typeof createState>[1] = {},
  ) => {
    const view = fakeView(createState(text, opts));
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search, replace })) });
    return view;
  };
  /** How many transactions the commands dispatch. */
  const counting = (view: EditorView) => {
    const real = view.dispatch.bind(view);
    const count = { dispatches: 0 };
    view.dispatch = ((...specs: TransactionSpec[]) => {
      count.dispatches++;
      real(...specs);
    }) as EditorView['dispatch'];
    return count;
  };

  it('replace changes the current match and moves to the next one', () => {
    const view = replacing(doc, 'cat', 'horse');
    findNext(view);
    expect(selected(view)).toEqual([0, 3]);
    expect(replaceNext(view)).toBe(true);
    expect(view.state.sliceDoc()).toBe('horse dog cat bird cat');
    // The second cat, in the new text
    expect(selected(view)).toEqual([10, 13]);
  });

  it('replace leaves every other character alone, and wraps around at the last match', () => {
    const view = replacing(doc, 'cat', 'X');
    findNext(view);
    for (let i = 0; i < 3; i++) replaceNext(view);
    expect(view.state.sliceDoc()).toBe('X dog X bird X');
    expect(countMatches(view.state)).toEqual({ total: 0, capped: false, index: null });
  });

  it('replace on a selection that is not a match only moves to the next match', () => {
    const view = replacing(doc, 'cat', 'horse');
    view.dispatch({ selection: { anchor: 5 } });
    expect(replaceNext(view)).toBe(true);
    expect(view.state.sliceDoc()).toBe(doc);
    expect(selected(view)).toEqual([8, 11]);
  });

  it('replace all changes every match in one transaction', () => {
    const view = replacing(doc, 'cat', 'horse');
    const count = counting(view);
    expect(replaceAll(view)).toBe(true);
    expect(view.state.sliceDoc()).toBe('horse dog horse bird horse');
    expect(count.dispatches).toBe(1);
  });

  it('one Undo undoes a replace all, and one Redo does it again', () => {
    const view = replacing(doc, 'cat', 'horse');
    replaceAll(view);
    expect(undo(view)).toBe(true);
    expect(view.state.sliceDoc()).toBe(doc);
    expect(redo(view)).toBe(true);
    expect(view.state.sliceDoc()).toBe('horse dog horse bird horse');
  });

  it('replace all with the replace field empty deletes the matches', () => {
    const view = replacing(doc, 'cat ', '');
    replaceAll(view);
    expect(view.state.sliceDoc()).toBe('dog bird cat');
  });

  it('change nothing and dispatch nothing when there are no matches', () => {
    const view = replacing(doc, 'zebra', 'horse');
    const count = counting(view);
    expect(replaceAll(view)).toBe(false);
    expect(replaceNext(view)).toBe(false);
    expect(view.state.sliceDoc()).toBe(doc);
    expect(count.dispatches).toBe(0);
  });

  it('refuse while the document is read-only', () => {
    const view = replacing(doc, 'cat', 'horse', { reading: true });
    findNext(view);
    const count = counting(view);
    expect(replaceNext(view)).toBe(false);
    expect(replaceAll(view)).toBe(false);
    expect(view.state.sliceDoc()).toBe(doc);
    expect(count.dispatches).toBe(0);
  });
});

describe('replacing in a document with Windows line endings', () => {
  const doc = 'one two\r\nthree two\r\n';
  /** A line feed that is not the end of a CRLF. */
  const bareBreaks = (text: string) => text.match(/(?<!\r)\n|\r(?!\n)/g) ?? [];
  const replacing = (search: string, replace: string) => {
    const view = fakeView(createState(doc, {}));
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search, replace })) });
    return view;
  };

  it('keeps every line ending when a word is replaced', () => {
    const view = replacing('two', '2');
    replaceAll(view);
    expect(view.state.sliceDoc()).toBe('one 2\r\nthree 2\r\n');
    const one = replacing('two', '2');
    findNext(one);
    replaceNext(one);
    expect(one.state.sliceDoc()).toBe('one 2\r\nthree two\r\n');
  });

  it("writes a line break typed as \\n as the document's own, with replace all", () => {
    const view = replacing('two', String.raw`x\ny`);
    replaceAll(view);
    expect(bareBreaks(view.state.sliceDoc())).toEqual([]);
    expect(view.state.sliceDoc()).toBe('one x\r\ny\r\nthree x\r\ny\r\n');
  });

  it("writes it as the document's own with replace, and the selection stays on the next match", () => {
    const view = replacing('two', String.raw`x\ny`);
    findNext(view);
    replaceNext(view);
    expect(view.state.sliceDoc()).toBe('one x\r\ny\r\nthree two\r\n');
    // Positions count a line break as one character, whatever it is written as
    const next = view.state.doc.toString().indexOf('two');
    expect(selected(view)).toEqual([next, next + 3]);
  });

  it('writes a typed \\r too', () => {
    const view = replacing('two', String.raw`x\ry`);
    replaceAll(view);
    expect(bareBreaks(view.state.sliceDoc())).toEqual([]);
  });

  it('undoes a replacement with line breaks in one step', () => {
    const view = replacing('two', String.raw`x\ny`);
    replaceAll(view);
    undo(view);
    expect(view.state.sliceDoc()).toBe(doc);
  });

  it('leaves a document with plain line feeds alone', () => {
    const view = fakeView(createState('one two\nthree two\n', {}));
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'two', replace: String.raw`x\ny` })),
    });
    replaceAll(view);
    expect(view.state.sliceDoc()).toBe('one x\ny\nthree x\ny\n');
  });
});

describe('the replace row', () => {
  const editing = () => fakeView(createState('text', {}));

  it('is not shown when the panel is opened to search', () => {
    const view = editing();
    openFind(view);
    expect(replaceShown(view.state)).toBe(false);
  });

  it('is shown by Find and Replace', () => {
    const view = editing();
    openReplace(view);
    expect(searchPanelOpen(view.state)).toBe(true);
    expect(replaceShown(view.state)).toBe(true);
  });

  it('stays as it is when Find is used on an open panel', () => {
    const view = editing();
    openReplace(view);
    openFind(view);
    expect(replaceShown(view.state)).toBe(true);
  });

  it('is gone again the next time the panel is opened to search', () => {
    const view = editing();
    openReplace(view);
    closeSearchPanel(view);
    openFind(view);
    expect(replaceShown(view.state)).toBe(false);
  });

  it('is shown and hidden by the toggle', () => {
    const view = editing();
    openFind(view);
    expect(toggleReplace(view)).toBe(true);
    expect(replaceShown(view.state)).toBe(true);
    expect(toggleReplace(view)).toBe(true);
    expect(replaceShown(view.state)).toBe(false);
  });

  it('cannot be shown while reading', () => {
    const view = fakeView(createState('text', { reading: true }));
    openFind(view);
    expect(toggleReplace(view)).toBe(false);
    expect(openReplace(view)).toBe(false);
    expect(replaceShown(view.state)).toBe(false);
  });
});
