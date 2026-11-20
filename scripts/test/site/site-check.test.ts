import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { siteProblems } from '../../lib/site-check';

const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'atropyle-site-'));
  temps.push(d);
  return d;
};
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

test('siteProblems reports a missing index.html', () => {
  const dir = temp();
  expect(siteProblems(dir, 'deweb')).toEqual([
    `index.html is missing in ${dir.split(sep).join('/')}; run npm run site:build -- --target deweb`,
  ]);
});

test('siteProblems on pages requires .nojekyll', () => {
  const dir = temp();
  writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  expect(siteProblems(dir, 'pages')).toEqual(['.nojekyll is missing (GitHub Pages would hide _astro/)']);
  writeFileSync(join(dir, '.nojekyll'), '');
  expect(siteProblems(dir, 'pages')).toEqual([]);
});

test('siteProblems on deweb reports external references and broken docs links', () => {
  const dir = temp();
  writeFileSync(join(dir, 'index.html'), '<img src="https://cdn.example/logo.png">');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'index.html'), '<a href="guide">Guide</a>');
  expect(siteProblems(dir, 'deweb')).toEqual([
    'index.html: external reference https://cdn.example/logo.png (html) breaks the 100% on-chain badge',
    'docs/index.html: link docs/guide falls back to index.html on the gateway',
  ]);
});
