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
import type { Tree } from '@lezer/common';

export interface HybridOptions {
  /** Turns an image path (relative to the file) into a loadable URL. */
  resolveImage?: (src: string) => string;
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

  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);
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
            const active = touches(parent.from, parent.to);
            const end = parent.name.startsWith('ATX') ? withSpace(ref.to) : ref.to;
            hideOrDim(active, ref.from, end);
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
            if (parent) hideOrDim(touches(parent.from, parent.to), ref.from, ref.to);
            return;

          case 'InlineCode':
            add(mark('cm-md-code'), ref.from, ref.to);
            return;
          case 'FencedCode':
          case 'CodeBlock':
            lines('cm-md-codeblock', ref.from, ref.to);
            return;
          case 'CodeMark':
            if (parent?.name === 'InlineCode') hideOrDim(touches(parent.from, parent.to), ref.from, ref.to);
            else dim(ref.from, ref.to);
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
            if (parent?.name === 'Link') hideOrDim(touches(parent.from, parent.to), ref.from, ref.to);
            return;

          case 'Image': {
            const m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)/.exec(doc.sliceString(ref.from, ref.to));
            if (!m) return;
            const widget = new ImageWidget(resolveImage(m[2]), m[1]);
            if (touches(ref.from, ref.to)) {
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
            hideOrDim(lineActive(ref.from), ref.from, withSpace(ref.to));
            return;

          case 'ListMark': {
            const list = parent?.parent;
            if (!parent || list?.name !== 'BulletList' || lineActive(ref.from)) {
              add(mark('cm-md-listmark'), ref.from, ref.to);
            } else if (parent.getChild('Task')) {
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
            if (lineActive(ref.from)) {
              dim(ref.from, ref.to);
              return;
            }
            const checked = /x/i.test(doc.sliceString(ref.from, ref.to));
            add(Decoration.replace({ widget: new CheckboxWidget(checked, ref.from) }), ref.from, ref.to);
            return;
          }

          case 'HorizontalRule':
            if (lineActive(ref.from)) {
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
            hideOrDim(lineActive(ref.from), ref.from, ref.from + 1);
            return;
        }
      },
    });
  }
  return Decoration.set(decos, true);
}

export function hybridMarkdown(opts: HybridOptions = {}) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state, syntaxTree(view.state), view.visibleRanges, opts);
      }
      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          this.decorations = buildDecorations(u.state, syntaxTree(u.state), u.view.visibleRanges, opts);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
