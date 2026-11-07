// Minimal path helpers (no Node). Accept both / and \ separators.

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : i === 0 ? '/' : '.';
}

const isAbsolute = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);

/** Resolves `target` (e.g. "./img/a.png") relative to the folder of `fromFile`. */
export function resolveRelative(fromFile: string, target: string): string {
  if (isAbsolute(target)) return target;
  const sep = fromFile.includes('\\') && !fromFile.includes('/') ? '\\' : '/';
  const parts = dirname(fromFile).split(/[\\/]/);
  for (const seg of target.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join(sep);
}
