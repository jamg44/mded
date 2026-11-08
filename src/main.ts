import { redo, undo } from '@codemirror/commands';
import type { Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createBar } from './bar';
import { reloadTransaction } from './editor/reload';
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
const bar = createBar();

/** Path of the open file (null = new, never-saved document). */
let path: string | null = null;
/** The document as it was when last loaded or saved, to know whether there are unsaved changes. */
let saved: Text = view.state.doc;
/**
 * Exactly what the file contained when we last read or wrote it (the baseline). Whether
 * another program changed the file is decided by comparing this with the disk, by content
 * and not by modification time. null: new document, or the file is known to be gone.
 */
let disk: string | null = null;
/** The file is gone from disk (deleted or moved): the text is kept and counts as unsaved. */
let missing = false;
/** While the conflict bar is up: the latest content seen on disk. */
let external: string | null = null;
let lastTitle = '';

const textChanged = () => !view.state.doc.eq(saved);
const isDirty = () => missing || textChanged();
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

function newState(doc: string) {
  return createState(doc, {
    resolveImage,
    joinSoftBreaks: prefs.breaks === 'join',
    onChange: onDocChange,
    onOpenLink: (url) => {
      if (/^(https?|mailto):/i.test(url)) platform.openUrl(url);
    },
  });
}

/** Watching is best effort: if it fails, the checks on focus and on save still protect the file. */
function setPath(newPath: string | null) {
  path = newPath;
  platform.watchFile(newPath).catch((e) => console.error(e));
}

function load(doc: string, newPath: string | null) {
  setPath(newPath);
  const state = newState(doc);
  saved = state.doc;
  disk = newPath === null ? null : doc;
  missing = false;
  external = null;
  bar.hide();
  view.setState(state);
  updateTitle();
  view.focus();
}

function onDocChange() {
  updateTitle();
  // The user edited the document until it is the file on disk: nothing left to resolve
  if (external !== null && view.state.sliceDoc() === external) adopt(external);
}

// ---------- Keeping the document and the file on disk consistent ----------

/** The document is now what the file contains. */
function adopt(content: string) {
  disk = content;
  saved = view.state.doc;
  missing = false;
  external = null;
  bar.hide();
  updateTitle();
}

/** Replaces the text with the file's content, so that undo brings back what was replaced. */
function reloadInto(content: string) {
  const tr = reloadTransaction(view.state, content);
  if (tr === 'rebuild') {
    // The line separator changed, and it is fixed when the state is created. Rare: undo history is lost
    view.setState(newState(content));
  } else if (tr) {
    // Before dispatching, so the title never shows the document as changed in between
    saved = tr.newDoc;
    view.dispatch(tr);
  }
  adopt(content);
}

function showConflict(content: string) {
  external = content;
  bar.conflict(fileName(), { reload: reloadFromDisk, keep: keepMine });
}

function showDeleted() {
  disk = null;
  missing = true;
  external = null;
  bar.deleted(fileName());
  updateTitle();
}

/**
 * Decides what to do with what is on disk now (null = the file is gone). Always called
 * right after the read that produced `content`, so the editor state it looks at is current.
 */
function applyDisk(content: string | null) {
  if (content === null) {
    if (!missing) showDeleted();
  } else if (content === disk) {
    // Same as the baseline: no external change (or it was undone by whoever made it)
    if (bar.kind === 'conflict') {
      external = null;
      bar.hide();
    }
  } else if (view.state.sliceDoc() === content) {
    adopt(content);
  } else if (!textChanged()) {
    reloadInto(content);
    bar.notice('Reloaded from disk');
  } else {
    showConflict(content);
  }
}

/** Actions that read the disk, the checks on save and the buttons of the bar run one at a time. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task);
  chain = run.catch(() => undefined);
  return run;
}

async function syncOnce() {
  const p = path;
  if (!p) return;
  try {
    const content = await platform.readFileIfExists(p);
    if (p === path) applyDisk(content);
  } catch (e) {
    // Not worth interrupting for: the next event, focus or save checks again
    console.error(e);
  }
}

let syncQueued = false;
/** Looks at the file on disk. Events that arrive while a check is already waiting share it. */
function syncFromDisk() {
  if (syncQueued) return;
  syncQueued = true;
  void serial(async () => {
    syncQueued = false;
    await syncOnce();
  });
}

/** Bar button. Reads the disk again: it may have changed several times since the bar appeared. */
function withCurrentDisk(action: (content: string | null) => void) {
  void serial(async () => {
    const p = path;
    if (!p) return;
    try {
      const content = await platform.readFileIfExists(p);
      if (p === path) action(content);
    } catch (e) {
      await fail(e);
    }
  });
}

function reloadFromDisk() {
  withCurrentDisk((content) => (content === null ? showDeleted() : reloadInto(content)));
}

/** The user has seen the version on disk and wants theirs: the next save may replace it. */
function keepMine() {
  withCurrentDisk((content) => {
    if (content === null) showDeleted();
    else if (view.state.sliceDoc() === content) adopt(content);
    else {
      disk = content;
      external = null;
      bar.hide();
    }
  });
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

function writeTo(p: string): Promise<boolean> {
  return serial(async () => {
    try {
      if (p === path) {
        // Never overwrite a version of the file that the user has not seen. A file that is
        // gone is fine: writing creates it again
        const current = await platform.readFileIfExists(p);
        if (current !== null && current !== disk) {
          applyDisk(current);
          return !isDirty();
        }
      }
      const doc = view.state.doc;
      // sliceDoc (not doc.toString) keeps the file's line separator (\n or \r\n)
      const contents = view.state.sliceDoc();
      await platform.writeFile(p, contents);
      if (p !== path) setPath(p);
      disk = contents;
      saved = doc;
      missing = false;
      external = null;
      bar.hide();
      prefs = savePrefs({ lastFile: p });
      lastTitle = '';
      updateTitle();
      return true;
    } catch (e) {
      await fail(e);
      return false;
    }
  });
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
  await platform.onFileChanged((changed) => {
    if (changed === path) syncFromDisk();
  });
  // Back in the window: catches what the watcher missed (sleep, network volumes)
  window.addEventListener('focus', syncFromDisk);
  // The file the app was launched with; otherwise, the last one opened
  const initial = await platform.initialFiles();
  if (initial.length) await openPath(initial[0]);
  else if (prefs.lastFile) await openPath(prefs.lastFile, true);
}

// Hook for the e2e tests in browser mode
// `settled` waits for the file checks that are queued (the e2e tests need to know when they ended)
if (!isTauri) Object.assign(window, { __mded: { view, platform, settled: () => chain } });

main().catch(fail);
