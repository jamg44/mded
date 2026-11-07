import { redo, undo } from '@codemirror/commands';
import type { Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createState, setJoinSoftBreaks } from './editor/setup';
import { basename, resolveRelative } from './paths';
import type { Platform } from './platform/types';
import {
  applyAppearance,
  type BreaksPref,
  loadPrefs,
  savePrefs,
  type ThemePref,
  type WidthPref,
} from './prefs';
import './styles.css';

const isTauri = '__TAURI_INTERNALS__' in window;
const platform: Platform = isTauri
  ? (await import('./platform/tauri')).tauriPlatform
  : (await import('./platform/web')).webPlatform;

let prefs = loadPrefs();
applyAppearance(prefs);
platform.setWindowTheme(prefs.theme === 'system' ? null : prefs.theme);

const view = new EditorView({ parent: document.getElementById('editor') as HTMLElement });

/** Path of the open file (null = new, never-saved document). */
let path: string | null = null;
/** Content as it is on disk, to know whether there are unsaved changes. */
let saved: Text = view.state.doc;
let lastTitle = '';

const isDirty = () => !view.state.doc.eq(saved);
const fileName = () => (path ? basename(path) : 'Untitled');

function updateTitle() {
  const title = `${isDirty() ? '• ' : ''}${fileName()} — mded`;
  if (title === lastTitle) return;
  lastTitle = title;
  platform.setTitle(title);
}

function resolveImage(src: string): string {
  if (/^(https?:|data:|blob:)/i.test(src) || !path) return src;
  return platform.fileUrl(resolveRelative(path, decodeURI(src)));
}

function load(doc: string, newPath: string | null) {
  path = newPath;
  const state = createState(doc, {
    resolveImage,
    joinSoftBreaks: prefs.breaks === 'join',
    onChange: updateTitle,
    onOpenLink: (url) => {
      if (/^(https?|mailto):/i.test(url)) platform.openUrl(url);
    },
  });
  saved = state.doc;
  view.setState(state);
  updateTitle();
  view.focus();
}

const fail = (e: unknown) => platform.error(String(e));

/** true if it is safe to continue (no changes, or the user agrees to discard them). */
async function confirmDiscard(): Promise<boolean> {
  if (!isDirty()) return true;
  return platform.confirm(`"${fileName()}" has unsaved changes. Discard them?`, 'Unsaved changes', 'Discard');
}

/** `quiet`: if it fails (e.g. the last file no longer exists) no error is shown. */
async function openPath(p: string, quiet = false) {
  try {
    load(await platform.readFile(p), p);
    prefs = savePrefs({ lastFile: p });
  } catch (e) {
    if (!quiet) await fail(e);
  }
}

/** Single window for now: only the first file is opened. */
async function openPaths(paths: string[]) {
  if (paths.length && (await confirmDiscard())) await openPath(paths[0]);
}

async function writeTo(p: string): Promise<boolean> {
  try {
    const doc = view.state.doc;
    // sliceDoc (not doc.toString) keeps the file's line separator (\n or \r\n)
    await platform.writeFile(p, view.state.sliceDoc());
    path = p;
    saved = doc;
    prefs = savePrefs({ lastFile: p });
    lastTitle = '';
    updateTitle();
    return true;
  } catch (e) {
    await fail(e);
    return false;
  }
}

async function saveAs(): Promise<boolean> {
  const p = await platform.pickSave(path ?? 'Untitled.md');
  return p ? writeTo(p) : false;
}

const actions = {
  async newFile() {
    if (await confirmDiscard()) load('', null);
  },
  async openFile() {
    if (!(await confirmDiscard())) return;
    const p = await platform.pickOpen();
    if (p) await openPath(p);
  },
  saveFile: () => (path ? writeTo(path) : saveAs()),
  saveAs,
  undo: () => undo(view),
  redo: () => redo(view),
  setTheme(theme: ThemePref) {
    prefs = savePrefs({ theme });
    applyAppearance(prefs);
    platform.setWindowTheme(theme === 'system' ? null : theme);
  },
  setWidth(width: WidthPref) {
    prefs = savePrefs({ width });
    applyAppearance(prefs);
    view.requestMeasure();
  },
  setBreaks(breaks: BreaksPref) {
    prefs = savePrefs({ breaks });
    setJoinSoftBreaks(view, breaks === 'join');
  },
};

async function main() {
  load('', null);
  await platform.installMenu(actions, prefs);
  await platform.onCloseRequested(confirmDiscard);
  await platform.onOpenFiles((paths) => void openPaths(paths));
  // The file the app was launched with; otherwise, the last one opened
  const initial = await platform.initialFiles();
  if (initial.length) await openPath(initial[0]);
  else if (prefs.lastFile) await openPath(prefs.lastFile, true);
}

// Hook for the e2e tests in browser mode
if (!isTauri) Object.assign(window, { __mded: { view, platform } });

main().catch(fail);
