import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, message, open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BREAKS_OPTIONS, type Prefs, THEME_OPTIONS, WIDTH_OPTIONS } from '../prefs';
import { type Actions, isMarkdownPath, MD_EXTENSIONS, type Platform } from './types';

const isMac = navigator.userAgent.includes('Mac');
const FILTERS = [{ name: 'Markdown', extensions: MD_EXTENSIONS }];
const win = getCurrentWindow();

/** Group of mutually exclusive checkmark items ("radio" style). */
async function radioGroup<T extends string>(
  options: [T, string][],
  current: T,
  onSelect: (value: T) => unknown,
): Promise<CheckMenuItem[]> {
  const items: CheckMenuItem[] = [];
  for (const [value, text] of options) {
    items.push(
      await CheckMenuItem.new({
        text,
        checked: value === current,
        action: async () => {
          // Clicking toggles the native checkmark, so re-place it across the whole group
          await Promise.all(items.map((it, i) => it.setChecked(options[i][0] === value)));
          await onSelect(value);
        },
      }),
    );
  }
  return items;
}

async function installMenu(a: Actions, prefs: Prefs) {
  const sep = () => PredefinedMenuItem.new({ item: 'Separator' });
  const item = (text: string, accelerator: string | undefined, action: () => unknown) =>
    MenuItem.new({ text, accelerator, action: () => void action() });
  const quit = () => item('Quit mded', 'CmdOrCtrl+Q', () => win.close());

  const fileMenu = await Submenu.new({
    text: 'File',
    items: [
      await item('New', 'CmdOrCtrl+N', a.newFile),
      await item('Open…', 'CmdOrCtrl+O', a.openFile),
      await sep(),
      await item('Save', 'CmdOrCtrl+S', a.saveFile),
      await item('Save As…', 'CmdOrCtrl+Shift+S', a.saveAs),
      await sep(),
      ...(isMac
        ? [await PredefinedMenuItem.new({ item: 'CloseWindow', text: 'Close Window' })]
        : [await quit()]),
    ],
  });

  // On macOS the menu accelerator catches the key before the webview;
  // on Windows/Linux we let CodeMirror's keymap handle undo/redo.
  const editMenu = await Submenu.new({
    text: 'Edit',
    items: [
      await item('Undo', isMac ? 'CmdOrCtrl+Z' : undefined, a.undo),
      await item('Redo', isMac ? 'CmdOrCtrl+Shift+Z' : undefined, a.redo),
      await sep(),
      await PredefinedMenuItem.new({ item: 'Cut', text: 'Cut' }),
      await PredefinedMenuItem.new({ item: 'Copy', text: 'Copy' }),
      await PredefinedMenuItem.new({ item: 'Paste', text: 'Paste' }),
      await PredefinedMenuItem.new({ item: 'SelectAll', text: 'Select All' }),
    ],
  });

  const viewMenu = await Submenu.new({
    text: 'View',
    items: [
      await Submenu.new({
        text: 'Appearance',
        items: await radioGroup(THEME_OPTIONS, prefs.theme, a.setTheme),
      }),
      await Submenu.new({
        text: 'Text Width',
        items: await radioGroup(WIDTH_OPTIONS, prefs.width, a.setWidth),
      }),
      await Submenu.new({
        text: 'Line Breaks',
        items: await radioGroup(BREAKS_OPTIONS, prefs.breaks, a.setBreaks),
      }),
      await sep(),
      await PredefinedMenuItem.new({ item: 'Fullscreen', text: 'Enter Full Screen' }),
    ],
  });

  const windowMenu = await Submenu.new({
    text: 'Window',
    items: [
      await PredefinedMenuItem.new({ item: 'Minimize', text: 'Minimize' }),
      await PredefinedMenuItem.new({ item: 'Maximize', text: 'Zoom' }),
    ],
  });

  const items = [fileMenu, editMenu, viewMenu, windowMenu];
  if (isMac) {
    items.unshift(
      await Submenu.new({
        text: 'mded',
        items: [
          await PredefinedMenuItem.new({ item: { About: null }, text: 'About mded' }),
          await sep(),
          await PredefinedMenuItem.new({ item: 'Services', text: 'Services' }),
          await sep(),
          await PredefinedMenuItem.new({ item: 'Hide', text: 'Hide mded' }),
          await PredefinedMenuItem.new({ item: 'HideOthers', text: 'Hide Others' }),
          await PredefinedMenuItem.new({ item: 'ShowAll', text: 'Show All' }),
          await sep(),
          await quit(),
        ],
      }),
    );
  }
  await (await Menu.new({ items })).setAsAppMenu();
}

export const tauriPlatform: Platform = {
  name: 'tauri',
  readFile: (path) => invoke<string>('read_file', { path }),
  readFileIfExists: (path) => invoke<string | null>('read_file_if_exists', { path }),
  writeFile: (path, contents) => invoke('write_file', { path, contents }),
  async pickOpen() {
    const p = await open({ multiple: false, directory: false, filters: FILTERS });
    return typeof p === 'string' ? p : null;
  },
  pickSave: (defaultName) => save({ defaultPath: defaultName, filters: FILTERS }),
  confirm: (msg, title, okLabel) => ask(msg, { title, kind: 'warning', okLabel, cancelLabel: 'Cancel' }),
  async error(msg) {
    await message(msg, { title: 'mded', kind: 'error' });
  },
  setTitle: (title) => void win.setTitle(title),
  openUrl: (url) => void openUrl(url),
  fileUrl: (absPath) => convertFileSrc(absPath),
  installMenu,
  setWindowTheme: (theme) => void win.setTheme(theme),
  async onCloseRequested(allowClose) {
    await win.onCloseRequested(async (e) => {
      if (!(await allowClose())) e.preventDefault();
    });
  },
  async onOpenFiles(handler) {
    await win.onDragDropEvent((e) => {
      if (e.payload.type !== 'drop') return;
      const md = e.payload.paths.filter(isMarkdownPath);
      if (md.length) handler(md);
    });
    // Finder "Open With" / double click while the app is already running (macOS)
    await listen<string[]>('open-files', (e) => handler(e.payload));
  },
  initialFiles: () => invoke<string[]>('initial_files'),
  watchFile: (path) => invoke('watch_file', { path }),
  async onFileChanged(handler) {
    await listen<string>('file-changed', (e) => handler(e.payload));
  },
};
