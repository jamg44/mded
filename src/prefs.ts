// User preferences, stored in the webview's local storage.
// Once there is a settings window (Cmd+,) they can move to a config file.

export type ThemePref = 'system' | 'light' | 'dark';
export type WidthPref = 'readable' | 'wide' | 'full';

export interface Prefs {
  theme: ThemePref;
  width: WidthPref;
  /** Reading Mode only: show single line breaks inside a paragraph as spaces (as rendered). */
  readingJoin: boolean;
  /** Last opened file, reopened on launch. */
  lastFile: string | null;
}

export const THEME_OPTIONS: [ThemePref, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export const WIDTH_OPTIONS: [WidthPref, string][] = [
  ['readable', 'Readable'],
  ['wide', 'Wide'],
  ['full', 'Full'],
];

const KEY = 'mded.prefs';
const DEFAULTS: Prefs = { theme: 'system', width: 'readable', readingJoin: false, lastFile: null };

export function loadPrefs(): Prefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // `breaks` was the old, always-on version of readingJoin: it means something else now,
    // so it is dropped and savePrefs stops writing it back
    const { breaks: _old, ...rest } = stored;
    return { ...DEFAULTS, ...rest };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(change: Partial<Prefs>): Prefs {
  const prefs = { ...loadPrefs(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // no storage available: the preference lasts until the app closes
  }
  return prefs;
}

/** Applies theme and width to the document (see styles.css: [data-theme], [data-width]). */
export function applyAppearance(prefs: Pick<Prefs, 'theme' | 'width'>) {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.width = prefs.width;
}
