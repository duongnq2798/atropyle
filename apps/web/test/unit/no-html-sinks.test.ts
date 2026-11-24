// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const SINKS =
  /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(|\brenderSVG\s*\(/;
/** The one inline script (Quyết định 14); its content is a constant. */
const ALLOWED = new Set(['theme/boot-script.tsx']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

it('no file writes HTML from a string, except the boot script', () => {
  const offenders = files(SRC)
    .map((f) => relative(SRC, f).replaceAll('\\', '/'))
    .filter((f) => !ALLOWED.has(f) && SINKS.test(readFileSync(join(SRC, f), 'utf8')));
  expect(offenders).toEqual([]);
});
