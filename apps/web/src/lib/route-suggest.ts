import { ROUTES } from '@/routes';

export type Suggestion = { kind: 'vault'; address: string } | { kind: 'route'; path: string };

const PAGES = Object.values(ROUTES).filter((p) => p !== '/');
const MAX_DISTANCE = 3;
const ADDRESS = /0x[0-9a-fA-F]{40}/;

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * For the 404 page: the vault, for a path that holds an address; else the nearest page, within min(3, a third of its
 * name) edits, so "prof" finds /proof/ and "a" finds nothing. Only ever one of this site's pages or a 40-hex address.
 */
export function suggestFor(pathname: string): Suggestion | null {
  const address = ADDRESS.exec(pathname)?.[0];
  if (address) return { kind: 'vault', address };
  const wanted = pathname
    .toLowerCase()
    .replace(/\.html$/, '')
    .replace(/^\/+|\/+$/g, '');
  if (wanted === '' || wanted.length > 40) return null;
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const page of PAGES) {
    const name = page.slice(1, -1);
    const d = levenshtein(wanted, name);
    if (d <= Math.min(MAX_DISTANCE, Math.floor(name.length / 3)) && d < bestDistance) {
      best = page;
      bestDistance = d;
    }
  }
  return best ? { kind: 'route', path: best } : null;
}
