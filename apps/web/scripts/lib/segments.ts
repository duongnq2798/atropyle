import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

/** The prefix of every prefetch file of a static export: `__next.<segment path, dots for slashes>.txt`. */
const SEGMENT_PREFIX = '__next.';

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? filesUnder(path) : [path];
  });
}

/** Every folder named `__next.*` in out/, not searched inside; `_next/` (one underscore) holds the chunks. */
function segmentFolders(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory()) return [];
    const path = join(dir, e.name);
    return e.name.startsWith(SEGMENT_PREFIX) ? [path] : segmentFolders(path);
  });
}

/**
 * After `next build` (run-next.ts), on Windows only. The static export of Next 16.4.6 lists each page's segments with
 * path.relative (next/dist/export/index.js, collectSegmentPaths), which on Windows gives `proof\__PAGE__.segment.rsc`.
 * convertSegmentPathToStaticExportFilename (shared/lib/segment-cache/segment-value-encoding.js) turns only `/` into
 * `.`, so path.join reads the backslash as a folder: out/proof/__next.proof/__PAGE__.txt. The router prefetches
 * /proof/__next.proof.__PAGE__.txt, which a Linux build (CI, Vercel) writes, so a Windows build answers every
 * prefetch of a nested route with a 404. This moves each file of such a folder to the flat name, then drops the
 * folder; on a flat export it changes nothing. Returns how many files it moved.
 */
export function flattenSegments(outDir: string): number {
  if (!existsSync(outDir)) return 0;
  let moved = 0;
  for (const folder of segmentFolders(outDir)) {
    for (const file of filesUnder(folder)) {
      const flat = join(dirname(folder), [basename(folder), ...relative(folder, file).split(sep)].join('.'));
      if (existsSync(flat)) throw new Error(`segments: ${flat} exists already; not overwriting it with ${file}`);
      renameSync(file, flat);
      moved += 1;
    }
    for (const dir of [folder, ...subfolders(folder)].reverse()) rmdirSync(dir);
  }
  return moved;
}

/** The folders under `dir`, parents before children. */
function subfolders(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? [join(dir, e.name), ...subfolders(join(dir, e.name))] : [],
  );
}
