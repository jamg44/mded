import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { tags as t } from '@lezer/highlight';
import { type HybridOptions, hybridMarkdown } from './hybrid';
import { incomingLines } from './incoming';
import { readingExtensions } from './reading';

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
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(codeHighlight),
    theme,
    EditorView.lineWrapping,
    placeholder('Write markdown…'),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'off', autocapitalize: 'on' }),
    hybridMarkdown(opts),
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
