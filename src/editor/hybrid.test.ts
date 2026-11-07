import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { Decoration } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { buildDecorations } from './hybrid';

/** Hidden text (replace without widget), dimmed text, widgets and line classes, with the cursor at `cursor`. */
function render(doc: string, cursor: number) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: markdown({ base: markdownLanguage }),
  });
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  if (!tree) throw new Error('incomplete parse');
  const set = buildDecorations(state, tree, [{ from: 0, to: doc.length }]);

  const hidden: string[] = [];
  const dimmed: string[] = [];
  const widgets: string[] = [];
  const lineClasses: string[] = [];
  set.between(0, doc.length, (from, to, deco: Decoration) => {
    const spec = deco.spec;
    if (spec.widget) widgets.push(spec.widget.constructor.name);
    else if (spec.class === 'cm-md-mark') dimmed.push(doc.slice(from, to));
    else if (from === to && spec.class) lineClasses.push(spec.class);
    else if (from !== to && !spec.class) hidden.push(doc.slice(from, to));
  });
  return { hidden, dimmed, widgets, lineClasses };
}

describe('hybrid mode', () => {
  it('hides bold markers when the cursor is outside', () => {
    const doc = 'some **bold** text';
    expect(render(doc, doc.length).hidden).toEqual(['**', '**']);
  });

  it('shows the markers dimmed when the cursor is inside', () => {
    const r = render('some **bold** text', 9);
    expect(r.hidden).toEqual([]);
    expect(r.dimmed).toEqual(['**', '**']);
  });

  it('hides the heading "# " except on its own line', () => {
    const doc = '# Title\n\ntext';
    expect(render(doc, doc.length).hidden).toEqual(['# ']);
    expect(render(doc, 3).dimmed).toContain('# ');
    expect(render(doc, 3).lineClasses).toContain('cm-md-h cm-md-h1');
  });

  it('hides brackets and URL of a link', () => {
    const doc = 'see [Tauri](https://tauri.app) now';
    expect(render(doc, doc.length).hidden).toEqual(['[', ']', '(', 'https://tauri.app', ')']);
  });

  it('leaves autolinks visible', () => {
    const doc = 'see <https://tauri.app> now';
    expect(render(doc, doc.length).hidden).not.toContain('https://tauri.app');
  });

  it('turns bullets and tasks into widgets outside the active line', () => {
    const doc = '- one\n- [x] done\n\nend';
    const r = render(doc, doc.length);
    expect(r.widgets).toEqual(['BulletWidget', 'CheckboxWidget']);
    expect(r.hidden).toContain('- ');
  });

  it('replaces an image with a widget, and shows it below while editing', () => {
    const doc = '![alt](./a.png)\n\nend';
    expect(render(doc, doc.length).widgets).toEqual(['ImageWidget']);
    const editing = render(doc, 3);
    expect(editing.widgets).toEqual(['ImageWidget']);
    expect(editing.dimmed).toEqual(['![alt](./a.png)']);
  });

  it('hides the backslash of an escape outside its line', () => {
    const doc = '1\\. not a list\n\nend';
    expect(render(doc, doc.length).hidden).toEqual(['\\']);
  });
});
