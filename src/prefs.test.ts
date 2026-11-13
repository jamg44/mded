import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPrefs, savePrefs } from './prefs';

/** A minimal localStorage: the unit tests run in Node. */
function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('preferences', () => {
  it('joining lines when reading is off by default', () => {
    storage();
    expect(loadPrefs().readingJoin).toBe(false);
  });

  it('drops the old `breaks` value instead of reading it as the new option', () => {
    storage({ 'mded.prefs': JSON.stringify({ breaks: 'join', theme: 'dark' }) });
    const prefs = loadPrefs();
    expect(prefs.readingJoin).toBe(false);
    expect(prefs).not.toHaveProperty('breaks');
    expect(prefs.theme).toBe('dark');
  });

  it('does not write the old value back when saving', () => {
    const data = storage({ 'mded.prefs': JSON.stringify({ breaks: 'join' }) });
    savePrefs({ readingJoin: true });
    const stored = JSON.parse(data.get('mded.prefs') ?? '{}');
    expect(stored.readingJoin).toBe(true);
    expect(stored).not.toHaveProperty('breaks');
  });
});
