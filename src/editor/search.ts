// Search and replace: CodeMirror's engine and panel, with the keys, the placement and the
// commands mded needs. The rest of the app takes what it needs from here, not from
// `@codemirror/search` (its own tests aside).
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  setSearchQuery,
} from '@codemirror/search';
import { ChangeSet, EditorState, Prec, StateEffect, StateField, Transaction } from '@codemirror/state';
import { type Command, EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';

export {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
};

// The replace row is shown on request: searching is the common case, and the row would take a
// line of the window every time. CodeMirror's panel always builds the row (while editing), so
// this only says whether it is displayed: the class it puts on the editor is what the theme in
// setup.ts keys on. Being editor state, it survives the panel being rebuilt on a mode switch.
const setReplaceShown = StateEffect.define<boolean>();
const replaceShownField = StateField.define<boolean>({
  create: () => false,
  update(shown, tr) {
    for (const effect of tr.effects) if (effect.is(setReplaceShown)) shown = effect.value;
    return shown;
  },
  provide: (field) =>
    EditorView.editorAttributes.from(field, (shown) => ({ class: shown ? 'cm-replace-shown' : '' })),
});

/** Whether the panel shows (or will show, when it opens) its replace row. */
export const replaceShown = (state: EditorState) => state.field(replaceShownField, false) ?? false;

/**
 * Cmd+F: opens the panel to search, with the focus in the search field and without the replace
 * row. A panel that is already open keeps the row as the user left it.
 */
export const openFind: Command = (view) => {
  if (!searchPanelOpen(view.state) && replaceShown(view.state)) {
    view.dispatch({ effects: setReplaceShown.of(false) });
  }
  return openSearchPanel(view);
};

/**
 * Cmd+Option+F: the panel with its replace row, and the focus in the replace field. Nothing while
 * the document is read-only: the panel is built without a replace field then.
 */
export const openReplace: Command = (view) => {
  if (view.state.readOnly) return false;
  if (!replaceShown(view.state)) view.dispatch({ effects: setReplaceShown.of(true) });
  openSearchPanel(view);
  const field = view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]');
  field?.focus();
  field?.select();
  return true;
};

/** The arrow at the left of the panel: shows or hides the replace row. */
export const toggleReplace: Command = (view) => {
  if (view.state.readOnly) return false;
  const show = !replaceShown(view.state);
  if (!show) {
    // The focus would be left on a control that is about to be hidden
    const focused = view.dom.querySelector<HTMLElement>('.cm-search :focus');
    if (focused?.matches('[name=replace], [name=replaceAll]')) {
      view.dom.querySelector<HTMLElement>('.cm-search input[name=search]')?.focus();
    }
  }
  view.dispatch({ effects: setReplaceShown.of(show) });
  return true;
};

/**
 * Runs `change`, which switches the editor between editing and Reading Mode, and builds the search
 * panel again if it is open. The panel decides when it is created whether to have a replace
 * field, and never reconsiders, so it has to be a new one for the new mode.
 *
 * The search survives: `openSearchPanel` fills the field from the selection when there is one,
 * which would silently replace what the user typed (a regular expression with the text it just
 * matched), so the query is put back. It all happens before the browser paints, so the panel is
 * never seen going away and coming back.
 */
export function rebuildingPanel(view: EditorView, change: () => void) {
  if (!searchPanelOpen(view.state)) return change();
  const query = getSearchQuery(view.state);
  closeSearchPanel(view);
  change();
  openSearchPanel(view);
  view.dispatch({ effects: setSearchQuery.of(query) });
}

// `scope` makes the keys work from the panel's own fields too. Mod-g carries Shift-Mod-g as
// its `shift` handler. Escape closes the panel and does nothing when it is closed, so the
// editor's own Escape (which simplifies the selection) still runs then.
const searchKeys = Prec.high(
  keymap.of([
    { key: 'Mod-f', run: openFind, scope: 'editor search-panel', preventDefault: true },
    { key: 'Mod-g', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
    { key: 'Mod-Alt-f', run: openReplace, scope: 'editor search-panel', preventDefault: true },
    { key: 'Escape', run: closeSearchPanel, scope: 'editor search-panel' },
  ]),
);

/**
 * A replacement can hold a line break, typed as `\n` in the replace field. CodeMirror splits
 * inserted text on the document's own line separator and nothing else, so in a file with Windows
 * line endings (`createState` sets `\r\n` for those) a bare `\n` would stay inside the line and be
 * saved as a lone line feed: a file with mixed line endings, which nobody asked for.
 *
 * Only replace operations are touched. The correction is a second change set, from the document
 * CodeMirror made to the right one, so the selection (the next match, after *replace*) is carried
 * through it, and the whole is still one transaction and one undo step.
 */
const replaceWithOwnLineBreaks = EditorState.transactionFilter.of((tr) => {
  const separator = tr.startState.facet(EditorState.lineSeparator);
  if (!separator || !tr.docChanged || !tr.isUserEvent('input.replace')) return tr;

  const fixes: { from: number; to: number; insert: string }[] = [];
  tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
    const lines = inserted.toJSON();
    // The lines of inserted text never contain the separator: what is left is a stray break
    if (!lines.some((line) => /[\r\n]/.test(line))) return;
    const insert = lines.map((line) => line.replace(/\r\n|\r|\n/g, separator)).join(separator);
    fixes.push({ from: fromB, to: toB, insert });
  });
  if (!fixes.length) return tr;

  const fix = ChangeSet.of(fixes, tr.newDoc.length, separator);
  return [
    {
      changes: tr.changes.compose(fix),
      selection: tr.selection?.map(fix),
      effects: tr.effects,
      userEvent: tr.annotation(Transaction.userEvent),
      scrollIntoView: tr.scrollIntoView,
    },
  ];
});

/** Height of what CodeMirror shows above the text: the search panel, or nothing. */
export const panelHeight = (view: EditorView) =>
  view.dom.querySelector('.cm-panels-top')?.getBoundingClientRect().height ?? 0;

/**
 * How far the scroll position has to move for the text to stay where it is on screen when the
 * panel's height changes by `delta` (positive: taller). Scrolling down by that much cancels the
 * panel pushing the text down. Zero when the first line of the document is in view and the panel
 * grows: there the text moves down with it, or the panel would cover the first lines with no way
 * to scroll them out from under it. Never more than the way back to the top.
 */
export function scrollShift(view: EditorView, delta: number): number {
  const top = view.scrollDOM.scrollTop;
  if (delta > 0) {
    const firstLineEnd = view.documentPadding.top + view.lineBlockAt(0).bottom;
    return top < firstLineEnd ? 0 : delta;
  }
  return Math.max(-top, delta);
}

/**
 * The panel sits above the text and pushes it down. To the reader the text should stay where
 * it was, so the scroll position follows the panel's height: in the same frame, because this
 * runs in CodeMirror's measure step, before the browser paints.
 *
 * The one exception is the start of the document (see `scrollShift`).
 *
 * A `scrollIntoView` in the same update wins over this, since CodeMirror applies it after the
 * measure writes: whoever asks for one while the panel's height changes has to include
 * `scrollShift` in it (see `applyReading` in main.ts).
 *
 * It also publishes the height as `--search-panel-height` on the editor's container, so the
 * Reading pill (which is not inside CodeMirror) can stay below the panel.
 */
const panelPlacement = ViewPlugin.fromClass(
  class {
    height = 0;
    constructor(readonly view: EditorView) {}

    update(u: ViewUpdate) {
      // Cheap when there is no panel: typing in a document must not cost a layout read each time
      if (this.height === 0 && !searchPanelOpen(u.state) && !searchPanelOpen(u.startState)) return;
      if (
        u.geometryChanged ||
        searchPanelOpen(u.state) !== searchPanelOpen(u.startState) ||
        // The replace row came or went: the panel is a row taller or shorter
        replaceShown(u.state) !== replaceShown(u.startState)
      ) {
        this.view.requestMeasure(this.measure);
      }
    }

    measure = {
      read: panelHeight,
      write: (height: number, view: EditorView) => {
        const delta = height - this.height;
        if (delta === 0) return;
        this.height = height;
        view.dom.parentElement?.style.setProperty('--search-panel-height', `${height}px`);

        view.scrollDOM.scrollTop += scrollShift(view, delta);
      },
    };

    destroy() {
      this.view.dom.parentElement?.style.removeProperty('--search-panel-height');
    }
  },
);

/** The search opened or closed, or its query changed (what the matches are depends on both). */
export const searchStateChanged = (before: EditorState, after: EditorState) =>
  searchPanelOpen(before) !== searchPanelOpen(after) || !getSearchQuery(before).eq(getSearchQuery(after));

// The same margin CodeMirror's own highlighter looks past the window, so a match that starts just
// outside it is still found
const REVEAL_MARGIN = 250;

/**
 * The matches of the open search in (and just around) the given ranges, for hybrid mode to
 * show what they hide. Nothing while the panel is closed, or for an empty or invalid query, which
 * is also when CodeMirror highlights nothing: what is revealed is what is highlighted.
 */
export function revealRanges(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
): { from: number; to: number }[] {
  const query = getSearchQuery(state);
  if (!searchPanelOpen(state) || !query.valid) return [];
  const found: { from: number; to: number }[] = [];
  for (const range of visible) {
    const from = Math.max(0, range.from - REVEAL_MARGIN);
    const to = Math.min(state.doc.length, range.to + REVEAL_MARGIN);
    const cursor = query.getCursor(state, from, to);
    for (let r = cursor.next(); !r.done; r = cursor.next()) {
      // A zero-width match hides nothing, and a window can overlap the next one's margin
      if (r.value.from < r.value.to && !found.some((f) => f.from === r.value.from && f.to === r.value.to)) {
        found.push({ from: r.value.from, to: r.value.to });
      }
    }
  }
  return found;
}

/** Counting stops here, so that one letter in a huge file (or a slow expression) cannot stall typing. */
export const COUNT_CAP = 9999;

export interface MatchCount {
  /** Matches in the whole document, at most `COUNT_CAP`. */
  total: number;
  /** There are more matches than `total` says. */
  capped: boolean;
  /** 1-based position of the match the selection is on, or null when it is on none. */
  index: number | null;
}

/**
 * How many matches the current query has in the whole document, and which one is selected.
 * Null when there is nothing to count: an empty search, or an invalid regular expression.
 * Zero-width matches (`x*`) are not counted: there is nothing to see or to select in them.
 */
export function countMatches(state: EditorState): MatchCount | null {
  const query = getSearchQuery(state);
  if (!query.valid) return null;
  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let index: number | null = null;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    if (r.value.from === r.value.to) continue;
    if (total === COUNT_CAP) return { total, capped: true, index };
    total++;
    if (index === null && r.value.from === from && r.value.to === to) index = total;
  }
  return { total, capped: false, index };
}

/** The text of the counter: "3 of 7", "7 matches", "No matches", or nothing for an empty search. */
export function countLabel(count: MatchCount | null): string {
  if (!count) return '';
  if (count.total === 0) return 'No matches';
  const total = count.capped ? `${count.total}+` : String(count.total);
  if (count.index !== null) return `${count.index} of ${total}`;
  return count.total === 1 && !count.capped ? '1 match' : `${total} matches`;
}

/**
 * What mded adds to CodeMirror's panel, which is otherwise used as it comes:
 * - a match counter, right after the search field;
 * - the previous and next buttons as arrows, in that order, each with a name for screen readers;
 * - an arrow at the left that shows or hides the replace row, while there is one.
 *
 * The panel is a different element each time it is built (every time it opens, and when the mode
 * changes), so all of it is put in place again whenever the current panel does not have it.
 */
const panelExtras = ViewPlugin.fromClass(
  class {
    label = document.createElement('span');
    toggle = document.createElement('button');
    constructor(readonly view: EditorView) {
      this.label.className = 'cm-search-count';
      // Announced politely: the count changes with every keystroke in the search field
      this.label.setAttribute('aria-live', 'polite');

      this.toggle.type = 'button';
      this.toggle.name = 'toggle-replace';
      this.toggle.className = 'cm-search-toggle';
      this.toggle.title = 'Toggle Replace';
      this.toggle.setAttribute('aria-label', 'Toggle Replace');
      this.toggle.textContent = '›';
      // Keeps the focus where it was (the search field, usually), as the buttons of the bar do
      this.toggle.addEventListener('mousedown', (e) => e.preventDefault());
      this.toggle.addEventListener('click', () => toggleReplace(view));

      if (searchPanelOpen(view.state)) this.schedule();
    }

    update(u: ViewUpdate) {
      const open = searchPanelOpen(u.state);
      if (
        open !== searchPanelOpen(u.startState) ||
        (open &&
          (u.docChanged ||
            u.selectionSet ||
            replaceShown(u.state) !== replaceShown(u.startState) ||
            !getSearchQuery(u.state).eq(getSearchQuery(u.startState))))
      ) {
        this.schedule();
      }
    }

    /** After the DOM is updated, so the panel exists when it is first opened. */
    schedule() {
      this.view.requestMeasure({ key: this, read: () => null, write: () => this.render() });
    }

    render() {
      const panel = this.view.dom.querySelector('.cm-search');
      if (!panel) return;

      const field = panel.querySelector('input[name=search]');
      if (field && this.label.previousElementSibling !== field) field.after(this.label);
      this.label.textContent = countLabel(countMatches(this.view.state));

      const next = panel.querySelector<HTMLElement>('button[name=next]');
      const previous = panel.querySelector<HTMLElement>('button[name=prev]');
      if (next && previous && previous.nextElementSibling !== next) {
        next.before(previous);
        previous.title = 'Previous match (Shift+Enter)';
        next.title = 'Next match (Enter)';
        // Said instead of the arrow, which a screen reader would otherwise read out too
        previous.setAttribute('aria-label', 'Previous match');
        next.setAttribute('aria-label', 'Next match');
      }

      // No replace field (Reading Mode): nothing to show or hide
      if (panel.querySelector('input[name=replace]')) {
        if (this.toggle.parentElement !== panel) panel.prepend(this.toggle);
        this.toggle.setAttribute('aria-expanded', String(replaceShown(this.view.state)));
      } else {
        this.toggle.remove();
      }
    }

    destroy() {
      this.label.remove();
      this.toggle.remove();
    }
  },
);

/** Search and replace for the editor. */
export const searchExtension = [
  search({ top: true }),
  searchKeys,
  replaceShownField,
  replaceWithOwnLineBreaks,
  panelPlacement,
  panelExtras,
];
