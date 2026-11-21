import { collectReferences } from './onchain-check';
import type { SiteFile } from './site-files';

/** TapeKit SPEC §6: drop ?#, decode, NFC, collapse slashes, strip the leading slash, "" or "x/" → "x/index.html". */
export function normalizeGatewayPath(raw: string): string | null {
  let p = raw;
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  p = p
    .normalize('NFC')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return p;
}

export type Resolution = { kind: 'exact' | 'index' | 'fallback'; path: string } | null;

/** Order: exact → "<p>/index.html" when the last segment has no extension → fallbackPath when no extension → 404. */
export function resolveNormalized(files: ReadonlySet<string>, fallback: string | null, p: string): Resolution {
  if (files.has(p)) return { kind: 'exact', path: p };
  const last = p.slice(p.lastIndexOf('/') + 1);
  if (last.includes('.')) return null;
  if (files.has(`${p}/index.html`)) return { kind: 'index', path: `${p}/index.html` };
  if (fallback && files.has(fallback)) return { kind: 'fallback', path: fallback };
  return null;
}

export function resolveGatewayPath(files: ReadonlySet<string>, fallback: string | null, raw: string): Resolution {
  const p = normalizeGatewayPath(raw);
  return p === null ? null : resolveNormalized(files, fallback, p);
}

export interface LinkProblem {
  from: string;
  ref: string;
  problem: 'fallback' | 'missing';
}

/** Every internal link of the HTML/CSS files under `prefix` must resolve exactly or to a folder index. */
export function checkInternalLinks(files: readonly SiteFile[], prefix: string, fallback: string | null): LinkProblem[] {
  const paths = new Set(files.map((f) => f.path));
  const td = new TextDecoder('utf-8', { fatal: false });
  const out: LinkProblem[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const kind = /\.html?$/i.test(f.path) ? 'html' : /\.css$/i.test(f.path) ? 'css' : null;
    if (!kind) continue;
    const fromDir = f.path.slice(0, f.path.lastIndexOf('/') + 1);
    for (const ref of collectReferences(td.decode(f.bytes), kind, fromDir)) {
      const r = resolveNormalized(paths, fallback, ref);
      if (r === null) out.push({ from: f.path, ref, problem: 'missing' });
      else if (r.kind === 'fallback') out.push({ from: f.path, ref, problem: 'fallback' });
    }
  }
  return out;
}
