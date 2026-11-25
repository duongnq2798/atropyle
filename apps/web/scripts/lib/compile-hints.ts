import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlFiles } from './csp';

/**
 * V8 explicit compile hints: this magic comment as the first line makes V8 compile every function of the file eagerly,
 * on a background thread while the file streams in, instead of lazily on the main thread the first time each runs.
 *
 * Measured on `/` in Plan 7A (ledger, parked "Startup JS task"): the one long task at startup ran app-index, React DOM
 * and the Flight client synchronously, and about 57% of it was lazy compile on the main thread. The hint on every chunk
 * took the Lighthouse TBT median from 152 ms to 0 (11 runs, max 19 ms), with FCP unchanged and no console error.
 * Hinting only the framework chunks was not enough (TBT 1 to 90 ms, depending on the host).
 */
export const COMPILE_HINT = '//# allFunctionsCalledOnLoad\n';

/** Where `next build` writes the scripts of every page; the file names are content hashes. */
export const CHUNKS_DIR = join('_next', 'static', 'chunks');

/** The `src` of every `<script noModule>`: polyfills that only browsers without ES modules (and without V8) load. */
export function noModuleScripts(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => {
    if (!/\snoModule(?=[\s=>/])/i.test(tag)) return [];
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    return src ? [src] : [];
  });
}

/** The file in out/ that a root-relative script `src` names, without its query or fragment. */
function fileOf(outDir: string, src: string): string {
  const path = src.replace(/[?#].*$/, '').replace(/^\//, '');
  return join(outDir, ...path.split('/'));
}

function jsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return jsFiles(path);
    return e.name.endsWith('.js') ? [path] : [];
  });
}

/**
 * After `next build` (run-next.ts): prepends COMPILE_HINT to every chunk in out/_next/static/chunks except the noModule
 * polyfills. A chunk that already starts with it is left as it is, so a second run changes nothing. The content of a
 * chunk stays a function of its hashed name, which keeps the immutable cache of /_next/static safe.
 * Returns how many chunks carry the hint.
 */
export function applyCompileHints(outDir: string): number {
  const dir = join(outDir, CHUNKS_DIR);
  if (!existsSync(dir)) return 0;
  const skip = new Set(
    htmlFiles(outDir)
      .flatMap((page) => noModuleScripts(readFileSync(page, 'utf8')))
      .map((src) => fileOf(outDir, src)),
  );
  let hinted = 0;
  for (const file of jsFiles(dir)) {
    if (skip.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (!src.startsWith(COMPILE_HINT)) writeFileSync(file, COMPILE_HINT + src);
    hinted++;
  }
  return hinted;
}
