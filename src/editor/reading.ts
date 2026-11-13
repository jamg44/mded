// Reading Mode: the document shown rendered and protected from accidental changes.
//
// Everything that differs from edit mode lives in one extension, swapped as a whole in the
// `mode` compartment of setup.ts, so the editor can never be half in one mode.
import { EditorState, type Extension, Facet, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { joinSoftBreaks } from './softbreaks';

/**
 * True while reading. Hybrid mode reads it to stop revealing markers at the caret. It is a
 * facet of its own, not `readOnly`: a read-only document (say, a file without write
 * permission) should still reveal markers where the caret is.
 */
export const readingMode = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

/** Scrolls by one line, as a reader does. The caret is hidden while reading, so moving it would look like nothing happened. */
const scrollLines = (lines: number) => (view: EditorView) => {
  view.scrollDOM.scrollBy({ top: lines * view.defaultLineHeight });
  return true;
};

// Highest precedence: CodeMirror's own caret motion must not run. Shift+arrows are other
// bindings, so they still extend the selection
const readingKeys = Prec.highest(
  keymap.of([
    { key: 'ArrowUp', run: scrollLines(-1) },
    { key: 'ArrowDown', run: scrollLines(1) },
  ]),
);

/**
 * What Reading Mode adds to the editor. `join` shows single line breaks inside a paragraph
 * as spaces; it exists only here, so edit mode can never join lines.
 *
 * `readOnly` makes CodeMirror discard typing, paste, cut, drop and undo/redo, while the caret,
 * keyboard selection and copy keep working. It does not stop code that dispatches by itself.
 */
export function readingExtensions(join: boolean): Extension {
  return [
    EditorState.readOnly.of(true),
    readingMode.of(true),
    EditorView.editorAttributes.of({ class: 'cm-reading' }),
    readingKeys,
    join ? joinSoftBreaks : [],
  ];
}
