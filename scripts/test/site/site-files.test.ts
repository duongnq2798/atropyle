import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
  CHUNK_MAX,
  chunk,
  contentTypeOf,
  LIMITS,
  limitProblems,
  makeSiteFile,
  sha256Hex,
  walkSite,
} from '../../lib/site-files';

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

test('chunk splits at CHUNK_MAX and keeps one empty chunk for an empty file', () => {
  expect(CHUNK_MAX).toBe(24_000);
  const sizes = chunk(new Uint8Array(50_001)).map((c) => c.length);
  expect(sizes).toEqual([24_000, 24_000, 2_001]);
  expect(chunk(new Uint8Array(24_000)).map((c) => c.length)).toEqual([24_000]);
  expect(chunk(new Uint8Array(0)).map((c) => c.length)).toEqual([0]);
});

test('sha256Hex matches the FIPS 180-2 vector', () => {
  expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
    '0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('contentTypeOf maps known extensions and falls back to octet-stream', () => {
  expect(contentTypeOf('index.html')).toBe('text/html; charset=utf-8');
  expect(contentTypeOf('assets/index-AbC.js')).toBe('text/javascript; charset=utf-8');
  expect(contentTypeOf('assets/verify.worker-AbC.js')).toBe('text/javascript; charset=utf-8');
  expect(contentTypeOf('assets/Index.CSS')).toBe('text/css; charset=utf-8');
  expect(contentTypeOf('favicon.svg')).toBe('image/svg+xml');
  expect(contentTypeOf('LICENSE')).toBe('application/octet-stream');
  expect(contentTypeOf('data.bin')).toBe('application/octet-stream');
});

test('walkSite returns sorted posix paths and skips dot files and source maps', () => {
  const root = mkdtempSync(join(tmpdir(), 'atropyle-walk-'));
  temps.push(root);
  mkdirSync(join(root, 'assets'));
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'assets', 'b.js'), '');
  writeFileSync(join(root, 'assets', 'a.css'), '');
  writeFileSync(join(root, 'assets', 'b.js.map'), '{}');
  writeFileSync(join(root, '.hidden'), '');
  writeFileSync(join(root, '.git', 'HEAD'), '');
  expect(walkSite(root)).toEqual(['assets/a.css', 'assets/b.js', 'index.html']);
});

test('limitProblems flags oversized files and too many paths', () => {
  const ok = makeSiteFile('index.html', new Uint8Array(10));
  expect(limitProblems([ok])).toEqual([]);
  const big = makeSiteFile('assets/big.js', new Uint8Array(LIMITS.fileBytes + 1));
  expect(limitProblems([ok, big])).toEqual(['assets/big.js: 8400001 bytes, the limit is 8400000']);
  const many = Array.from({ length: LIMITS.paths + 1 }, (_, i) => makeSiteFile(`p/${i}.txt`, new Uint8Array(0)));
  expect(limitProblems(many)).toEqual(['5001 paths, the limit is 5000']);
});
