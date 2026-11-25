import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { format } from '../../src/i18n/core';
import { messages as home } from '../../src/messages/home.messages';
import { messages as shell } from '../../src/messages/shell.messages';
import { outOf } from './paths';

const deployment = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../deployments/xlayer.json', import.meta.url)), 'utf8'),
) as { circuits: { netlistKeccak: { policy: string } } };
const KECCAK = deployment.circuits.netlistKeccak.policy;
const SHORT = `${KECCAK.slice(0, 6)}…${KECCAK.slice(-4)}`;

/** The text a reader sees: tags and React's `<!-- -->` separators removed. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, '');
const metas = (html: string, name: string) => html.match(new RegExp(`<meta[^>]*name="${name}"[^>]*>`, 'g')) ?? [];

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} shell`, () => {
    const read = (file: string) => readFileSync(join(outOf(target), file), 'utf8');

    it('runs the boot script in the head, before anything paints', () => {
      const html = read('index.html');
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head).toContain('"atropyle:theme"');
      expect(head).toContain('location.replace');
      expect(html).toMatch(/<html lang="en"/);
    });

    it('opens at night: no theme attribute, one night theme colour, a dark colour scheme', () => {
      const html = read('index.html');
      expect(html.match(/<html[^>]*>/)?.[0]).not.toContain('data-theme');
      const colours = metas(html, 'theme-color');
      expect(colours).toHaveLength(1);
      expect(colours[0]).toContain('content="#0b0d12"');
      expect(colours[0]).not.toContain('media=');
      expect(metas(html, 'color-scheme')).toEqual([expect.stringContaining('content="dark"')]);
    });

    it('prerenders the proof line and the footer on every page, and the home and 404 text', () => {
      const proof = format(shell.en.proofLine, { keccak: SHORT, limits: shell.en.proofLimits });
      for (const file of ['index.html', '404.html']) {
        const html = read(file);
        expect(textOf(html), file).toContain(proof);
        expect(html, file).toContain('href="/proof/#limits"');
        expect(html, file).toContain('href="/verify/"');
        expect(textOf(html), file).toContain(shell.en.noTrackers);
      }
      expect(textOf(read('404.html'))).toContain(shell.en.notFoundTitle);
      const index = textOf(read('index.html'));
      expect(index).toContain(home.en.heroTitle);
      expect(index).toContain(home.en.heroDrill);
    });

    it('prerenders the live regions of the wrong-network banner and of a failed load, empty, above the main', () => {
      // A live region that arrives already filled is not reliably read out, so both are there from the first paint.
      for (const file of ['index.html', '404.html']) {
        const html = read(file);
        const main = html.indexOf('<main');
        const banner = html.indexOf('<div aria-live="polite"></div>');
        const notice = html.indexOf('<div role="alert" data-testid="load-notice"></div>');
        expect(banner, file).toBeGreaterThan(html.indexOf('</header>'));
        expect(notice, file).toBeGreaterThan(banner);
        expect(main, file).toBeGreaterThan(notice);
      }
    });
  });
}
