/**
 * The bar above the editor (file conflict, file deleted, changes merged) and the transient notice.
 * Plain DOM: the elements live in index.html.
 *
 * None of this ever takes keyboard focus: someone typing must not be able to answer a
 * question they have not read by pressing a key (the buttons are for the pointer, and
 * `mousedown` does not move the focus out of the editor either).
 */

export type BarKind = 'conflict' | 'deleted' | 'merged';

export interface ConflictActions {
  reload(): unknown;
  keep(): unknown;
}

const NOTICE_MS = 2500;
const FADE_MS = 300;

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el;
}

export function createBar() {
  const bar = element('bar');
  const message = element('bar-message');
  const actions = element('bar-actions');
  const notice = element('notice');
  let kind: BarKind | null = null;
  let fade: ReturnType<typeof setTimeout> | undefined;
  let hideNotice: ReturnType<typeof setTimeout> | undefined;

  function show(next: BarKind, text: string) {
    kind = next;
    bar.dataset.kind = next;
    message.textContent = text;
    actions.replaceChildren();
    bar.hidden = false;
  }

  function button(label: string, onClick: () => unknown) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    // Keeps the focus (and the caret) in the editor
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => void onClick());
    return b;
  }

  return {
    /** null when no bar is showing. */
    get kind() {
      return kind;
    },

    /** The file changed on disk and the document has unsaved changes. Stays until resolved. */
    conflict(fileName: string, a: ConflictActions) {
      show(
        'conflict',
        `“${fileName}” changed on disk, and you have unsaved changes made on an older version.`,
      );
      actions.append(button('Reload from disk', a.reload), button('Keep mine', a.keep));
    },

    /** The file is gone. Informational: saving creates it again. */
    deleted(fileName: string) {
      show('deleted', `“${fileName}” no longer exists on disk. Saving will create it again.`);
    },

    /**
     * Changes from disk were merged into the document and their lines are highlighted.
     * Informational: it lasts as long as the highlight, which `clear` removes.
     */
    merged(clear: () => unknown) {
      show(
        'merged',
        'Changes from disk were merged into your text and are highlighted. Review them, then save.',
      );
      actions.append(button('Clear highlight', clear));
    },

    hide() {
      kind = null;
      bar.hidden = true;
      message.textContent = '';
      actions.replaceChildren();
    },

    /** Brief, non-blocking message that goes away by itself. */
    notice(text: string) {
      clearTimeout(fade);
      clearTimeout(hideNotice);
      notice.textContent = text;
      notice.classList.remove('out');
      notice.hidden = false;
      fade = setTimeout(() => notice.classList.add('out'), NOTICE_MS - FADE_MS);
      hideNotice = setTimeout(() => {
        notice.hidden = true;
      }, NOTICE_MS);
    },
  };
}

export type Bar = ReturnType<typeof createBar>;
