import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { tags as t } from '@lezer/highlight';
import { type HybridOptions, hybridMarkdown } from './hybrid';
import { joinSoftBreaks } from './softbreaks';

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

const softBreaks = new Compartment();

/** Turns visual joining of single line breaks on or off in an existing editor. */
export function setJoinSoftBreaks(view: EditorView, join: boolean) {
  view.dispatch({ effects: softBreaks.reconfigure(join ? joinSoftBreaks : []) });
}

export interface EditorOptions extends HybridOptions {
  /** Show single line breaks inside a paragraph as spaces (as rendered). */
  joinSoftBreaks?: boolean;
  onChange?: (state: EditorState) => void;
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
    softBreaks.of(opts.joinSoftBreaks ? joinSoftBreaks : []),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange?.(u.state);
    }),
    EditorView.domEventHandlers({
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
