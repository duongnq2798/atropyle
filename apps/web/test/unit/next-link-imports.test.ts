// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * The files that may import next/link, and why. React starts no view transition on a client navigation in this
 * Next version (Plan 7A Task 15, outcome B; test/e2e/motion.spec.ts), so a link to another route is a NavLink, and
 * next/link is only for a hash link within the same page. A file that needs one goes on this list with its reason.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'shell/nav-link.tsx': 'NavLink is next/link with a view transition around the navigation',
  'home/hero.tsx': "7A's first scene; 7C replaces the whole file, gives its CTAs NavLink and takes it off this list",
};

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('links to another route', () => {
  it('go through NavLink: only the files on the list import next/link', () => {
    const importers = files(SRC)
      .filter((f) => /\bfrom\s+['"]next\/link['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'));
    // Equal, not a subset: a file that no longer needs next/link leaves the list as well.
    expect(importers.sort()).toEqual(Object.keys(ALLOWED).sort());
  });
});
