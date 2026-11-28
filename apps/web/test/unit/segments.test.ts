// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenSegments } from '../../scripts/lib/segments';

/** A static export as `next build` writes it on Windows: the segment of a nested route lands in a folder. */
function site(files: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), 'atropyle-segments-'));
  for (const [path, body] of Object.entries(files)) {
    const file = join(out, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  return out;
}
const read = (out: string, path: string) => readFileSync(join(out, ...path.split('/')), 'utf8');
const has = (out: string, path: string) => existsSync(join(out, ...path.split('/')));

describe('flattenSegments', () => {
  it('moves each segment of a nested route to the flat name the router asks for, and drops the folder', () => {
    const out = site({
      'proof/__next.proof/__PAGE__.txt': 'proof page',
      'proof/__next._tree.txt': 'tree',
      'proof/index.html': '<p>proof</p>',
      '_not-found/__next._not-found/__PAGE__.txt': 'not found',
      'vault/one/__next.vault/one/__PAGE__.txt': 'deep',
    });
    expect(flattenSegments(out)).toBe(3);
    expect(read(out, 'proof/__next.proof.__PAGE__.txt')).toBe('proof page');
    expect(read(out, '_not-found/__next._not-found.__PAGE__.txt')).toBe('not found');
    expect(read(out, 'vault/one/__next.vault.one.__PAGE__.txt')).toBe('deep');
    expect(has(out, 'proof/__next.proof')).toBe(false);
    expect(has(out, 'vault/one/__next.vault')).toBe(false);
    expect(read(out, 'proof/__next._tree.txt')).toBe('tree');
    expect(readdirSync(join(out, 'proof')).sort()).toEqual([
      '__next._tree.txt',
      '__next.proof.__PAGE__.txt',
      'index.html',
    ]);
  });

  it('leaves an export that is flat already (Linux, Vercel) as it is, and a second run changes nothing', () => {
    const out = site({
      '__next.__PAGE__.txt': 'home',
      'proof/__next.proof.__PAGE__.txt': 'proof page',
      '_next/static/chunks/app.js': 'js',
    });
    expect(flattenSegments(out)).toBe(0);
    expect(read(out, 'proof/__next.proof.__PAGE__.txt')).toBe('proof page');
    expect(read(out, '_next/static/chunks/app.js')).toBe('js');
    const windows = site({ 'proof/__next.proof/__PAGE__.txt': 'proof page' });
    flattenSegments(windows);
    expect(flattenSegments(windows)).toBe(0);
  });

  it('refuses to overwrite a flat file that is already there', () => {
    const out = site({
      'proof/__next.proof/__PAGE__.txt': 'from the folder',
      'proof/__next.proof.__PAGE__.txt': 'flat',
    });
    expect(() => flattenSegments(out)).toThrow(/__next\.proof\.__PAGE__\.txt/);
    expect(read(out, 'proof/__next.proof.__PAGE__.txt')).toBe('flat');
  });

  it('does nothing in an empty folder', () => {
    expect(flattenSegments(mkdtempSync(join(tmpdir(), 'atropyle-segments-')))).toBe(0);
  });
});
