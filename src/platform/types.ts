import type { BreaksPref, Prefs, ThemePref, WidthPref } from '../prefs';

/** Editor actions that the platform wires to menus or shortcuts. */
export interface Actions {
  newFile(): unknown;
  openFile(): unknown;
  saveFile(): unknown;
  saveAs(): unknown;
  undo(): unknown;
  redo(): unknown;
  setTheme(theme: ThemePref): unknown;
  setWidth(width: WidthPref): unknown;
  setBreaks(breaks: BreaksPref): unknown;
}

/**
 * Everything that depends on the environment. Two implementations:
 * - tauri: the native app.
 * - web: the same editor in a browser with in-memory files (`pnpm web`, e2e tests).
 */
export interface Platform {
  readonly name: 'tauri' | 'web';
  readFile(path: string): Promise<string>;
  /**
   * Like `readFile`, but null if the file does not exist. Any other failure (permissions,
   * not UTF-8…) still throws: an unreadable file must not look like a deleted one.
   */
  readFileIfExists(path: string): Promise<string | null>;
  writeFile(path: string, contents: string): Promise<void>;
  /**
   * Watches the file for changes made by other programs, replacing the previous watch
   * (null = stop). Failing to watch is not fatal: the checks on focus and on save remain.
   */
  watchFile(path: string | null): Promise<void>;
  /**
   * `handler` runs with the watched file's path when it may have changed. It is only a hint
   * (it can fire for our own writes or for nothing): the caller compares the content.
   */
  onFileChanged(handler: (path: string) => void): Promise<void>;
  /** Open dialog. null = cancelled. */
  pickOpen(): Promise<string | null>;
  /** Save dialog. null = cancelled. */
  pickSave(defaultName: string): Promise<string | null>;
  confirm(message: string, title: string, okLabel: string): Promise<boolean>;
  error(message: string): Promise<void>;
  setTitle(title: string): void;
  openUrl(url: string): void;
  /** Loadable URL for a local file (images). */
  fileUrl(absPath: string): string;
  /** `prefs` sets the checked options in the View menu. */
  installMenu(actions: Actions, prefs: Prefs): Promise<void>;
  /** Appearance of the native window (title bar). null = follow the system. */
  setWindowTheme(theme: 'light' | 'dark' | null): void;
  /** `allowClose` decides whether the window may close. */
  onCloseRequested(allowClose: () => Promise<boolean>): Promise<void>;
  /** Files arriving while the app is running: drag and drop, Finder "Open With". */
  onOpenFiles(handler: (paths: string[]) => void): Promise<void>;
  /** Files the app was launched with. */
  initialFiles(): Promise<string[]>;
}

export const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'txt'];
export const isMarkdownPath = (p: string) => new RegExp(`\\.(${MD_EXTENSIONS.join('|')})$`, 'i').test(p);
