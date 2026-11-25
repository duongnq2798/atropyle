// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPO_URL } from '../../src/lib/links';
import { LIMIT_LINKS } from '../../src/proof/limit-links';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PREFIX = `${REPO_URL}/blob/main/`;
/** GitHub's anchor of a Markdown heading: lower case, punctuation dropped, each space a hyphen. */
const slug = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');

describe('#limits links', () => {
  for (const [name, href] of Object.entries(LIMIT_LINKS)) {
    it(`${name} points at a file and a heading of this repository, on main`, () => {
      expect(href.startsWith(PREFIX), href).toBe(true);
      const [path, anchor] = href.slice(PREFIX.length).split('#');
      expect(existsSync(`${ROOT}${path}`), path).toBe(true);
      if (anchor !== undefined) {
        const text = readFileSync(`${ROOT}${path}`, 'utf8');
        const anchors = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]));
        expect(anchors, path).toContain(anchor);
      }
    });
  }
});
