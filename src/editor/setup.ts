import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState, type Extension, Prec } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { tags as t } from '@lezer/highlight';
import { type HybridOptions, hybridMarkdown } from './hybrid';
import { incomingLines } from './incoming';
import { readingExtensions } from './reading';
import { searchExtension } from './search';

// Colors for code blocks only; the markdown look comes from hybrid.ts
const codeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'tok-string' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-comment' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.typeName, t.className], class: 'tok-type' },
]);

// Rules that must beat CodeMirror's base styles (themes take precedence over them)
const theme = EditorView.theme({
  '.cm-scroller': {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: '16px',
    lineHeight: '1.65',
  },
  '.cm-content': {
    maxWidth: 'var(--content-width)',
    width: '100%',
    margin: '0 auto',
    padding: '40px 32px 50vh',
    caretColor: 'var(--accent)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  // Lines that came from disk (see incoming.ts). A box-shadow paints above the line's own
  // background, so it also shows on code blocks, and it can be transitioned. A transition
  // uses the style the element ends up with: the base rule fades the highlight out when the
  // class goes away, and `none` on the highlighted line makes it appear at once.
  '.cm-line': { transition: 'box-shadow 0.8s ease' },
  '.cm-line.cm-incoming': {
    transition: 'none',
    boxShadow: 'inset 3px 0 0 var(--incoming-bar), inset 0 0 0 100vmax var(--incoming-bg)',
  },
  // Reading Mode (reading.ts). `.cm-reading` is on the editor's root, the element that carries
  // this theme's class, so the rules need `&`: a plain `.cm-reading …` would never match
  '&.cm-reading .cm-md-checkbox': { cursor: 'default' },
  // No caret while reading: the selection is still there, and comes back as the caret when editing
  '&.cm-reading .cm-cursorLayer': { display: 'none' },
  '&.cm-reading .cm-content': { caretColor: 'transparent' },
  '.cm-line.cm-md-codeblock': { paddingLeft: '12px' },
  '.cm-line.cm-md-quote': { paddingLeft: '14px' },

  // Search panel (search.ts). The panel is CodeMirror's own, dressed in the app's tokens.
  // It sits above the text; its content lines up with the text column
  '.cm-panels': {
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: '13px',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panel.cm-search': {
    maxWidth: 'var(--content-width)',
    margin: '0 auto',
    padding: '8px 32px 6px',
    '& input, & button, & label': { margin: '0 8px 4px 0' },
    '& input[type=checkbox]': { margin: '0 4px 0 0', accentColor: 'var(--accent)' },
    '& label': { fontSize: '12px', color: 'var(--muted)', whiteSpace: 'pre' },
    // "all" selects every match, which needs multiple selections: the editor has none
    '& button[name=select]': { display: 'none' },
    '& button[name=close]': {
      right: '24px',
      top: '6px',
      margin: 0,
      color: 'var(--muted)',
      fontSize: '18px',
      lineHeight: '1',
      cursor: 'pointer',
    },
    '& button[name=close]:hover': { color: 'var(--text)' },
    // Previous and next as arrows: the words CodeMirror puts in the buttons are given no size and
    // the arrow is drawn instead (search.ts names them for screen readers)
    '& button[name=prev], & button[name=next]': {
      fontSize: '0',
      padding: '3px 7px',
      margin: '0 4px 4px 0',
    },
    '& button[name=next]': { marginRight: '10px' },
    '& button[name=prev]::before, & button[name=next]::before': { fontSize: '14px', lineHeight: '18px' },
    '& button[name=prev]::before': { content: '"↑"' },
    '& button[name=next]::before': { content: '"↓"' },
    // The arrow that shows the replace row, in the panel's left margin so the fields of both
    // rows line up
    '& .cm-search-toggle': {
      position: 'absolute',
      left: '6px',
      top: '9px',
      width: '20px',
      height: '22px',
      margin: 0,
      padding: 0,
      border: 'none',
      borderRadius: '4px',
      background: 'transparent',
      color: 'var(--muted)',
      fontSize: '16px',
      lineHeight: '20px',
      cursor: 'pointer',
      transition: 'transform 0.1s',
    },
    '& .cm-search-toggle:hover': { color: 'var(--text)', background: 'var(--code-bg)' },
    '& .cm-search-toggle[aria-expanded=true]': { transform: 'rotate(90deg)' },
  },
  // The replace row is in the panel all along (while editing) and shown on request: search.ts
  // puts `cm-replace-shown` on the editor
  '&:not(.cm-replace-shown) .cm-panel.cm-search': {
    '& br, & [name=replace], & [name=replaceAll]': { display: 'none' },
  },
  // Right after the search field, and as wide empty as full, so the buttons after it stay put
  '.cm-panel.cm-search .cm-search-count': {
    display: 'inline-block',
    minWidth: '76px',
    margin: '0 8px 4px 0',
    fontSize: '12px',
    color: 'var(--muted)',
    whiteSpace: 'pre',
    // A zero-width space: an empty inline block would sit on the baseline by its bottom edge
    '&::before': { content: '"\\200b"' },
  },
  '.cm-panel.cm-search .cm-textfield': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 8px',
    outline: 'none',
  },
  '.cm-panel.cm-search .cm-textfield:focus': { borderColor: 'var(--accent)' },
  '.cm-panel.cm-search .cm-button': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'var(--text)',
    backgroundColor: 'var(--code-bg)',
    backgroundImage: 'none',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '3px 10px',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search .cm-button:hover': { borderColor: 'var(--accent)' },
  // CodeMirror picks the colors of the matches by whether *it* thinks the theme is dark, which it
  // does not know (the app's dark mode is a CSS token switch): these take them from the tokens
  '.cm-searchMatch': { backgroundColor: 'var(--match-bg)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--match-current-bg)' },
});

/** URL of the [text](url) link at the position, if any. */
function linkAt(state: EditorState, pos: number): string | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'Link' || node.name === 'Autolink') {
      const url = node.getChild('URL');
      return url ? state.sliceDoc(url.from, url.to) : null;
    }
    if (node.name === 'URL') return state.sliceDoc(node.from, node.to);
  }
  return null;
}

const mode = new Compartment();

/** What the compartment holds for a mode. Edit mode adds nothing: it is the editor's base. */
const modeExtension = (reading: boolean, join: boolean) => (reading ? readingExtensions(join) : []);

export interface ReadingState {
  reading: boolean;
  /** Reading Mode only: show single line breaks inside a paragraph as spaces. */
  join: boolean;
}

/** The effect that moves an existing editor to a mode (or changes the join option of Reading Mode). */
export function readingModeEffect({ reading, join }: ReadingState) {
  return mode.reconfigure(modeExtension(reading, join));
}

export interface EditorOptions extends HybridOptions {
  /** Start in Reading Mode. */
  reading?: boolean;
  /** Reading Mode joins single line breaks inside a paragraph (as rendered). */
  readingJoin?: boolean;
  onChange?: (state: EditorState) => void;
  /** The user tried to change the document while it is read-only (typing, paste, drop…). */
  onReadOnlyInput?: () => void;
  /** Cmd/Ctrl + click on a link. */
  onOpenLink?: (url: string) => void;
}

export function editorExtensions(opts: EditorOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    searchExtension,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(codeHighlight),
    theme,
    EditorView.lineWrapping,
    placeholder('Write markdown…'),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'off', autocapitalize: 'on' }),
    // Lowest, so that the highlight of a search match is drawn *inside* a styled piece of text
    // and not around it: around, it cuts inline code into pieces, each with its own padding and
    // its own background over the highlight
    Prec.lowest(hybridMarkdown(opts)),
    mode.of(modeExtension(opts.reading ?? false, opts.readingJoin ?? false)),
    incomingLines,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange?.(u.state);
    }),
    EditorView.domEventHandlers({
      // Fires for every attempt to change the text (typing, Enter, delete, paste, cut, drop)
      // and not for moving the caret or copying. We only report it: CodeMirror discards the input.
      beforeinput(_e, view) {
        if (view.state.readOnly) opts.onReadOnlyInput?.();
        return false;
      },
      mousedown(e, view) {
        if (!(e.metaKey || e.ctrlKey) || !opts.onOpenLink) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        const url = pos == null ? null : linkAt(view.state, pos);
        if (!url) return false;
        e.preventDefault();
        opts.onOpenLink(url);
        return true;
      },
    }),
  ];
}

export function createState(doc: string, opts: EditorOptions): EditorState {
  // Keep the file's line endings: otherwise CodeMirror would save "\r\n" as "\n"
  const lineEnding = doc.includes('\r\n') ? [EditorState.lineSeparator.of('\r\n')] : [];
  return EditorState.create({ doc, extensions: [...lineEnding, ...editorExtensions(opts)] });
}
