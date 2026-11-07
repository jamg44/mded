// Browser platform: the same editor with in-memory files.
// Used to try the editor without the native app (`pnpm web`) and for the e2e tests.
// Paths starting with /examples/ are fetched from the Vite dev server.
import { basename } from '../paths';
import { type Actions, MD_EXTENSIONS, type Platform } from './types';

const files = new Map<string, string>();

function pickLocalFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MD_EXTENSIONS.map((e) => `.${e}`).join(',');
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const path = `/local/${f.name}`;
      files.set(path, await f.text());
      resolve(path);
    });
    input.click();
  });
}

export const webPlatform: Platform & { files: Map<string, string> } = {
  name: 'web',
  files,
  async readFile(path) {
    const cached = files.get(path);
    if (cached !== undefined) return cached;
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Could not read ${path}: ${res.status}`);
    const text = await res.text();
    files.set(path, text);
    return text;
  },
  async writeFile(path, contents) {
    files.set(path, contents);
  },
  pickOpen: pickLocalFile,
  async pickSave(defaultName) {
    const name = prompt('Save as', basename(defaultName));
    return name ? `/local/${name}` : null;
  },
  confirm: async (msg) => window.confirm(msg),
  error: async (msg) => {
    console.error(msg);
    alert(msg);
  },
  setTitle: (title) => {
    document.title = title;
  },
  openUrl: (url) => void window.open(url, '_blank', 'noopener'),
  fileUrl: (absPath) => absPath,
  setWindowTheme() {},
  async installMenu(a: Actions) {
    // No native menu: equivalent keyboard shortcuts. Undo/redo are handled by CodeMirror.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const shortcuts: Record<string, () => unknown> = {
          n: a.newFile,
          o: a.openFile,
          s: e.shiftKey ? a.saveAs : a.saveFile,
        };
        const action = shortcuts[e.key.toLowerCase()];
        if (!action) return;
        e.preventDefault();
        void action();
      },
      true,
    );
  },
  async onCloseRequested() {},
  async onOpenFiles() {},
  async initialFiles() {
    // ?file=/examples/other.md   ·   ?file= (empty) starts with no file
    const file = new URLSearchParams(location.search).get('file');
    if (file === '') return [];
    return [file ?? '/examples/example.md'];
  },
};
