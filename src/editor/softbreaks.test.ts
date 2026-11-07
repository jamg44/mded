import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createState } from './setup';
import { softBreakRanges } from './softbreaks';

/** Text that would be displayed as a single space. */
function joins(doc: string) {
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) });
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  if (!tree) throw new Error('incomplete parse');
  return softBreakRanges(state, tree).map((r) => doc.slice(r.from, r.to));
}

describe('soft line breaks', () => {
  it('joins the lines of a paragraph', () => {
    expect(joins('one\ntwo\nthree')).toEqual(['\n', '\n']);
  });

  it('does not join paragraphs separated by a blank line', () => {
    expect(joins('one\n\ntwo')).toEqual([]);
  });

  it('keeps hard breaks (two spaces or a backslash)', () => {
    expect(joins('one  \ntwo\\\nthree')).toEqual([]);
  });

  it('absorbs the indentation of a list item continuation', () => {
    expect(joins('1. one\n   two')).toEqual(['\n   ']);
  });

  it('leaves the ">" of a blockquote to the hybrid mode', () => {
    expect(joins('> one\n> two')).toEqual(['\n']);
  });

  it('does not touch code blocks or headings', () => {
    expect(joins('# title\n\n```\na\nb\n```')).toEqual([]);
  });
});

describe('line endings', () => {
  it('keeps \\r\\n when converting back to text', () => {
    const doc = 'one\r\ntwo\r\n';
    expect(createState(doc, {}).sliceDoc()).toBe(doc);
  });

  it('keeps \\n', () => {
    const doc = 'one\ntwo\n';
    expect(createState(doc, {}).sliceDoc()).toBe(doc);
  });
});
