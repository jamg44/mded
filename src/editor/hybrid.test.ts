import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { Decoration } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { buildDecorations } from './hybrid';
import { readingMode } from './reading';

/** Where the `nth` occurrence of `needle` is in `doc`, as a range of a search match. */
function range(doc: string, needle: string, nth = 0) {
  let from = -1;
  for (let i = 0; i <= nth; i++) from = doc.indexOf(needle, from + 1);
  if (from < 0) throw new Error(`"${needle}" is not in the document`);
  return { from, to: from + needle.length };
}

/**
 * Hidden text (replace without widget), dimmed text, widgets and line classes, with the cursor
 * at `cursor` and the given matches of an open search.
 */
function render(doc: string, cursor: number, reading = false, reveal: { from: number; to: number }[] = []) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage }), readingMode.of(reading)],
  });
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  if (!tree) throw new Error('incomplete parse');
  const set = buildDecorations(state, tree, [{ from: 0, to: doc.length }], { reveal });

  const hidden: string[] = [];
  const dimmed: string[] = [];
  const widgets: string[] = [];
  const lineClasses: string[] = [];
  const listMarks: string[] = [];
  set.between(0, doc.length, (from, to, deco: Decoration) => {
    const spec = deco.spec;
    if (spec.widget) widgets.push(spec.widget.constructor.name);
    else if (spec.class === 'cm-md-mark') dimmed.push(doc.slice(from, to));
    else if (spec.class === 'cm-md-listmark') listMarks.push(doc.slice(from, to));
    else if (from === to && spec.class) lineClasses.push(spec.class);
    else if (from !== to && !spec.class) hidden.push(doc.slice(from, to));
  });
  return { hidden, dimmed, widgets, lineClasses, listMarks };
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

  describe('in Reading Mode', () => {
    it('hides the heading marker even with the cursor on the heading', () => {
      const doc = '# Title\n\ntext';
      const r = render(doc, 3, true);
      expect(r.hidden).toEqual(['# ']);
      expect(r.dimmed).toEqual([]);
    });

    it('hides bold markers even with the cursor inside', () => {
      const r = render('some **bold** text', 9, true);
      expect(r.hidden).toEqual(['**', '**']);
      expect(r.dimmed).toEqual([]);
    });

    it('keeps the task checkbox as a widget on the cursor line', () => {
      const r = render('- [ ] todo\n\nend', 4, true);
      expect(r.widgets).toEqual(['CheckboxWidget']);
      expect(r.dimmed).toEqual([]);
    });

    it('keeps the bullet as a widget on the cursor line', () => {
      const r = render('- one\n\nend', 3, true);
      expect(r.widgets).toEqual(['BulletWidget']);
    });

    it('still reveals markers in edit mode', () => {
      expect(render('some **bold** text', 9).dimmed).toEqual(['**', '**']);
    });
  });
});

describe('a search match on hidden text', () => {
  // The caret is at the end of each document, away from what is searched for
  const away = (doc: string) => doc.length;

  it('shows both markers of the bold it is on, and no other bold', () => {
    const doc = 'some **bold** and **more** text';
    const r = render(doc, away(doc), false, [range(doc, '**')]);
    expect(r.dimmed).toEqual(['**', '**']);
    expect(r.hidden).toEqual(['**', '**']);
    // The dimmed pair is the first bold's
    const second = render(doc, away(doc), false, [range(doc, '**', 3)]);
    expect(second.dimmed).toEqual(['**', '**']);
    expect(second.hidden).toEqual(['**', '**']);
  });

  it('shows a link when its URL, a bracket or its title matches', () => {
    const doc = 'see [Tauri](https://tauri.app "home") now';
    for (const needle of ['tauri.app', '[', '"home"', '](']) {
      const r = render(doc, away(doc), false, [range(doc, needle)]);
      expect(r.hidden, needle).toEqual([]);
      expect(r.dimmed, needle).toEqual(['[', ']', '(', 'https://tauri.app', '"home"', ')']);
    }
  });

  it('shows nothing when the match is only on visible text', () => {
    const doc = 'some **bold** text and [a link](https://x.io) end';
    const r = render(doc, away(doc), false, [range(doc, 'bold'), range(doc, 'a link')]);
    expect(r.hidden).toEqual(['**', '**', '[', ']', '(', 'https://x.io', ')']);
    expect(r.dimmed).toEqual([]);
  });

  it('shows nothing when the match only ends where a marker begins', () => {
    const doc = 'some **bold** text';
    // "some " ends where the opening ** starts, and "bold" where the closing ** starts
    for (const needle of ['some ', 'bold']) {
      const r = render(doc, away(doc), false, [range(doc, needle)]);
      expect(r.hidden, needle).toEqual(['**', '**']);
      expect(r.dimmed, needle).toEqual([]);
    }
  });

  it('shows a match that covers a marker and the text next to it', () => {
    const doc = 'some **bold** text';
    const r = render(doc, away(doc), false, [range(doc, 'e **b')]);
    expect(r.dimmed).toEqual(['**', '**']);
  });

  it('shows the marker of a heading', () => {
    const doc = '# Title\n\ntext';
    expect(render(doc, away(doc), false, [range(doc, '#')]).dimmed).toEqual(['# ']);
    // The title itself is visible
    expect(render(doc, away(doc), false, [range(doc, 'Title')]).hidden).toEqual(['# ']);
  });

  it('shows the backticks of inline code and the tildes of a strikethrough', () => {
    const code = 'use `code` here';
    expect(render(code, away(code), false, [range(code, '`')]).dimmed).toEqual(['`', '`']);
    const strike = 'a ~~gone~~ b';
    expect(render(strike, away(strike), false, [range(strike, '~~')]).dimmed).toEqual(['~~', '~~']);
  });

  it('shows an image as its markdown when any part of it matches', () => {
    const doc = '![alt](./a.png)\n\nend';
    for (const needle of ['./a.png', 'alt', '![']) {
      const r = render(doc, away(doc), false, [range(doc, needle)]);
      expect(r.dimmed, needle).toEqual(['![alt](./a.png)']);
    }
  });

  it('shows a bullet as its marker instead of the dot', () => {
    const doc = '- one\n\nend';
    const r = render(doc, away(doc), false, [range(doc, '-')]);
    expect(r.widgets).toEqual([]);
    expect(r.listMarks).toEqual(['-']);
  });

  it('shows the task box as its markdown, and leaves the bullet hidden', () => {
    const doc = '- [ ] todo\n\nend';
    const r = render(doc, away(doc), false, [range(doc, '[ ]')]);
    expect(r.widgets).toEqual([]);
    expect(r.dimmed).toEqual(['[ ]']);
    expect(r.hidden).toEqual(['- ']);
  });

  it('shows a quote mark, a horizontal rule and an escape', () => {
    const quote = '> quoted\n\nend';
    expect(render(quote, away(quote), false, [range(quote, '>')]).dimmed).toEqual(['> ']);
    const rule = 'text\n\n---\n\nend';
    expect(render(rule, away(rule), false, [range(rule, '---')]).dimmed).toEqual(['---']);
    const escaped = '1\\. not a list\n\nend';
    expect(render(escaped, away(escaped), false, [range(escaped, '\\')]).dimmed).toEqual(['\\']);
  });

  it('does nothing without matches', () => {
    const doc = 'some **bold** and [a link](https://x.io) end';
    expect(render(doc, away(doc), false, []).dimmed).toEqual([]);
  });

  describe('in Reading Mode', () => {
    it('shows the markers of the element it is on', () => {
      const doc = 'some **bold** and **more** text';
      const r = render(doc, away(doc), true, [range(doc, '**')]);
      expect(r.dimmed).toEqual(['**', '**']);
      expect(r.hidden).toEqual(['**', '**']);
    });

    it('shows a link whose URL matches', () => {
      const doc = 'see [Tauri](https://tauri.app) now';
      const r = render(doc, away(doc), true, [range(doc, 'tauri.app')]);
      expect(r.hidden).toEqual([]);
      expect(r.dimmed).toEqual(['[', ']', '(', 'https://tauri.app', ')']);
    });

    it('keeps the markers hidden when the match is on visible text', () => {
      const doc = 'some **bold** text';
      const r = render(doc, away(doc), true, [range(doc, 'bold')]);
      expect(r.hidden).toEqual(['**', '**']);
      expect(r.dimmed).toEqual([]);
    });

    it('still ignores the caret', () => {
      const doc = 'some **bold** text';
      const r = render(doc, 9, true, []);
      expect(r.hidden).toEqual(['**', '**']);
      expect(r.dimmed).toEqual([]);
    });
  });
});
