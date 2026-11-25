import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** The front door a judge or reviewer reads first, at the root of the repository. */
const DOCS = ['README.md', 'SECURITY.md'] as const;
/** Every host a doc links, lowercased. */
const hosts = (text: string) =>
  [...text.matchAll(/https?:\/\/([^/\s)>`"'#]+)/g)].map((m) => (m[1] as string).toLowerCase());

describe('the front-door docs (README.md, SECURITY.md)', () => {
  it.each(DOCS)('%s links the site only at https://atropyle.xyz', (file) => {
    const text = read(`../../../${file}`);
    const site = hosts(text).filter((h) => h.includes('atropyle') || h.endsWith('vercel.app'));
    expect(site.length).toBeGreaterThan(0);
    expect([...new Set(site)]).toEqual(['atropyle.xyz']);
    expect(text).not.toMatch(/http:\/\/(www\.)?atropyle\.xyz/i);
  });
});
