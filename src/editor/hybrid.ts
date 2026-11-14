// Hybrid mode (Typora / Obsidian Live Preview style).
// The document stays plain markdown text; only the view is decorated:
// markers (#, **, `, [](), >, -) are hidden and reappear dimmed
// when the cursor enters the element they belong to.

import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range, SelectionRange } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { SyntaxNode, Tree } from '@lezer/common';
import { readingMode } from './reading';
import { revealRanges, searchStateChanged } from './search';

export interface HybridOptions {
  /** Turns an image path (relative to the file) into a loadable URL. */
  resolveImage?: (src: string) => string;
  /**
   * Ranges that must be seen: the matches of an open search. An element whose hidden text they
   * overlap shows its markers, in Reading Mode too. Not the caret: the selection reveals nothing
   * there, and a match does, because it is what the user asked to see.
   */
  reveal?: readonly { from: number; to: number }[];
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-bullet';
    s.textContent = '•';
    return s;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-md-checkbox';
    box.checked = this.checked;
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // The toggle is a direct dispatch, which readOnly does not stop
      if (view.state.readOnly) return;
      // "[ ]" <-> "[x]": edits the text itself, not a separate model
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' },
      });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-md-image';
    img.src = this.src;
    img.alt = this.alt;
    return img;
  }
}

const cache = new Map<string, Decoration>();
const mark = (cls: string) => {
  const key = `m:${cls}`;
  if (!cache.has(key)) cache.set(key, Decoration.mark({ class: cls }));
  return cache.get(key) as Decoration;
};
const line = (cls: string) => {
  const key = `l:${cls}`;
  if (!cache.has(key)) cache.set(key, Decoration.line({ class: cls }));
  return cache.get(key) as Decoration;
};
const hidden = Decoration.replace({});

/** Pure logic (no view) so it can be tested: state + tree + visible ranges → decorations. */
export function buildDecorations(
  state: EditorState,
  tree: Tree,
  visible: readonly { from: number; to: number }[],
  opts: HybridOptions = {},
): DecorationSet {
  const doc = state.doc;
  const decos: Range<Decoration>[] = [];
  const ranges: readonly SelectionRange[] = state.selection.ranges;
  const resolveImage = opts.resolveImage ?? ((s: string) => s);
  const reveal = opts.reveal ?? [];

  // Reading: the caret reveals nothing, so every marker stays hidden or rendered
  const reading = state.facet(readingMode);
  const touches = (from: number, to: number) => !reading && ranges.some((r) => r.from <= to && r.to >= from);
  const lineActive = (pos: number) => {
    const l = doc.lineAt(pos);
    return touches(l.from, l.to);
  };
  const add = (deco: Decoration, from: number, to = from) => decos.push(deco.range(from, to));
  const hide = (from: number, to: number) => {
    if (to > from) add(hidden, from, to);
  };
  const dim = (from: number, to: number) => {
    if (to > from) add(mark('cm-md-mark'), from, to);
  };
  const hideOrDim = (active: boolean, from: number, to: number) => (active ? dim(from, to) : hide(from, to));
  const withSpace = (to: number) => (doc.sliceString(to, to + 1) === ' ' ? to + 1 : to);
  // A match reveals an element when it shares at least one character with text the element hides.
  // Strictly: a match that only ends where a marker begins has nothing hidden in it. The whole
  // element is then revealed (both `**`, not just the one that matched), as if the caret were in it
  const overlaps = (from: number, to: number) => reveal.some((r) => r.from < to && r.to > from);
  const childHit = (parent: SyntaxNode, ...names: string[]) =>
    names.some((n) => parent.getChildren(n).some((c) => overlaps(c.from, c.to)));
  const lines = (cls: string, from: number, to: number) => {
    for (let pos = from; pos <= to; ) {
      const l = doc.lineAt(pos);
      add(line(cls), l.from);
      pos = l.to + 1;
    }
  };

  for (const { from, to } of visible) {
    tree.iterate({
      from,
      to,
      enter(ref) {
        const { name } = ref;
        const parent = ref.node.parent;

        const heading = /^(ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          lines(`cm-md-h cm-md-h${heading[2]}`, ref.from, ref.from);
          return;
        }

        switch (name) {
          case 'HeaderMark': {
            if (!parent) return;
            const atx = parent.name.startsWith('ATX');
            const end = atx ? withSpace(ref.to) : ref.to;
            const found = parent
              .getChildren('HeaderMark')
              .some((m) => overlaps(m.from, atx ? withSpace(m.to) : m.to));
            hideOrDim(touches(parent.from, parent.to) || found, ref.from, end);
            return;
          }

          case 'Emphasis':
            add(mark('cm-md-em'), ref.from, ref.to);
            return;
          case 'StrongEmphasis':
            add(mark('cm-md-strong'), ref.from, ref.to);
            return;
          case 'Strikethrough':
            add(mark('cm-md-strike'), ref.from, ref.to);
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (parent) {
              const found = childHit(parent, 'EmphasisMark', 'StrikethroughMark');
              hideOrDim(touches(parent.from, parent.to) || found, ref.from, ref.to);
            }
            return;

          case 'InlineCode':
            add(mark('cm-md-code'), ref.from, ref.to);
            return;
          case 'FencedCode':
          case 'CodeBlock':
            lines('cm-md-codeblock', ref.from, ref.to);
            return;
          case 'CodeMark':
            if (parent?.name === 'InlineCode') {
              hideOrDim(touches(parent.from, parent.to) || childHit(parent, 'CodeMark'), ref.from, ref.to);
            } else dim(ref.from, ref.to);
            return;
          case 'CodeInfo':
            dim(ref.from, ref.to);
            return;

          case 'Link':
            add(mark('cm-md-link'), ref.from, ref.to);
            return;
          case 'LinkMark':
          case 'LinkTitle':
          case 'URL':
            // Only inside [text](url); autolinks <https://…> stay visible
            if (parent?.name === 'Link') {
              const found = childHit(parent, 'LinkMark', 'LinkTitle', 'URL');
              hideOrDim(touches(parent.from, parent.to) || found, ref.from, ref.to);
            }
            return;

          case 'Image': {
            const m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)/.exec(doc.sliceString(ref.from, ref.to));
            if (!m) return;
            const widget = new ImageWidget(resolveImage(m[2]), m[1]);
            // All of an image's markdown is hidden behind the picture, so any match in it shows it
            if (touches(ref.from, ref.to) || overlaps(ref.from, ref.to)) {
              dim(ref.from, ref.to);
              add(Decoration.widget({ widget, side: 1 }), ref.to);
            } else {
              add(Decoration.replace({ widget }), ref.from, ref.to);
            }
            return false;
          }

          case 'Blockquote':
            lines('cm-md-quote', ref.from, ref.to);
            return;
          case 'QuoteMark':
            hideOrDim(
              lineActive(ref.from) || overlaps(ref.from, withSpace(ref.to)),
              ref.from,
              withSpace(ref.to),
            );
            return;

          case 'ListMark': {
            const list = parent?.parent;
            const task = parent?.getChild('Task');
            const revealed = overlaps(ref.from, task ? withSpace(ref.to) : ref.to);
            if (!parent || list?.name !== 'BulletList' || lineActive(ref.from) || revealed) {
              add(mark('cm-md-listmark'), ref.from, ref.to);
            } else if (task) {
              hide(ref.from, withSpace(ref.to));
            } else {
              add(Decoration.replace({ widget: new BulletWidget() }), ref.from, ref.to);
            }
            return;
          }
          case 'Task':
            if (/^\[[xX]\]/.test(doc.sliceString(ref.from, ref.from + 3))) {
              add(mark('cm-md-done'), ref.from + 3, ref.to);
            }
            return;
          case 'TaskMarker': {
            if (lineActive(ref.from) || overlaps(ref.from, ref.to)) {
              dim(ref.from, ref.to);
              return;
            }
            const checked = /x/i.test(doc.sliceString(ref.from, ref.to));
            add(Decoration.replace({ widget: new CheckboxWidget(checked, ref.from) }), ref.from, ref.to);
            return;
          }

          case 'HorizontalRule':
            if (lineActive(ref.from) || overlaps(ref.from, ref.to)) {
              dim(ref.from, ref.to);
            } else {
              lines('cm-md-hr', ref.from, ref.from);
              hide(ref.from, ref.to);
            }
            return;

          case 'Table':
            lines('cm-md-table', ref.from, ref.to);
            return;
          case 'TableDelimiter':
            dim(ref.from, ref.to);
            return;

          case 'Escape':
            hideOrDim(lineActive(ref.from) || overlaps(ref.from, ref.from + 1), ref.from, ref.from + 1);
            return;
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

export function hybridMarkdown(opts: HybridOptions = {}) {
  const build = (state: EditorState, view: EditorView) =>
    buildDecorations(state, syntaxTree(state), view.visibleRanges, {
      ...opts,
      reveal: revealRanges(state, view.visibleRanges),
    });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view.state, view);
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          // Entering or leaving Reading Mode is a reconfiguration, none of the above
          u.startState.facet(readingMode) !== u.state.facet(readingMode) ||
          // The search opened or closed, or its query changed: matches reveal markers
          searchStateChanged(u.startState, u.state) ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          this.decorations = build(u.state, u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
