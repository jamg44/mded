import { describe, expect, it } from 'vitest';
import { basename, resolveRelative } from './paths';

describe('paths', () => {
  it('basename', () => {
    expect(basename('/a/b/notes.md')).toBe('notes.md');
    expect(basename('C:\\docs\\notes.md')).toBe('notes.md');
  });

  it('resolves paths relative to the file', () => {
    expect(resolveRelative('/a/b/notes.md', './img/x.png')).toBe('/a/b/img/x.png');
    expect(resolveRelative('/a/b/notes.md', '../x.png')).toBe('/a/x.png');
    expect(resolveRelative('/a/b/notes.md', '/abs/x.png')).toBe('/abs/x.png');
    expect(resolveRelative('C:\\docs\\notes.md', 'img\\x.png')).toBe('C:\\docs\\img\\x.png');
  });
});
