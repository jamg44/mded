// User preferences, stored in the webview's local storage.
// Once there is a settings window (Cmd+,) they can move to a config file.

export type ThemePref = 'system' | 'light' | 'dark';
export type WidthPref = 'readable' | 'wide' | 'full';
export type BreaksPref = 'join' | 'keep';

export interface Prefs {
  theme: ThemePref;
  width: WidthPref;
  /** Single line breaks inside a paragraph: join them (as rendered) or show them as in the file. */
  breaks: BreaksPref;
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

export const BREAKS_OPTIONS: [BreaksPref, string][] = [
  ['join', 'Join Paragraphs'],
  ['keep', 'As in File'],
];

const KEY = 'mded.prefs';
const DEFAULTS: Prefs = { theme: 'system', width: 'readable', breaks: 'join', lastFile: null };

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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
