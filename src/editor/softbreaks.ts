// Soft line breaks: in markdown a single line break inside a paragraph is a
// space, and renderers reflow the paragraph to the available width.
// Here we do the same in the VIEW ONLY: the "\n" (plus the next line's
// indentation) is displayed as a space. The text does not change.
//
// This lives in a StateField rather than in the hybrid ViewPlugin because
// decorations that span line breaks cannot come from a ViewPlugin.
import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { Tree } from '@lezer/common';

class SpaceWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-softbreak';
    s.textContent = ' ';
    return s;
  }
}

const joined = Decoration.replace({ widget: new SpaceWidget() });

/** Ranges [from, to) shown as a space: the "\n" plus the next line's indentation. */
export function softBreakRanges(state: EditorState, tree: Tree): { from: number; to: number }[] {
  const doc = state.doc;
  const out: { from: number; to: number }[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== 'Paragraph') return;
      const first = doc.lineAt(node.from).number;
      const last = doc.lineAt(node.to).number;
      for (let n = first; n < last; n++) {
        const line = doc.line(n);
        // Hard break: two trailing spaces or a backslash → keep it
        if (/( {2,}|\\)$/.test(line.text)) continue;
        const next = doc.line(n + 1);
        const indent = /^[ \t]*/.exec(next.text)?.[0].length ?? 0;
        out.push({ from: line.to, to: next.from + indent });
      }
      return false;
    },
  });
  return out;
}

function build(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = softBreakRanges(state, syntaxTree(state)).map((r) =>
    joined.range(r.from, r.to),
  );
  return Decoration.set(decos);
}

const softBreakField = StateField.define<DecorationSet>({
  create: build,
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return build(tr.state);
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    // The cursor skips the whole gap, and deleting removes it at once (joins the lines in the file)
    EditorView.atomicRanges.of((view) => view.state.field(f)),
  ],
});

export const joinSoftBreaks = softBreakField;
