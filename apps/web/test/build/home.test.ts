import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { GEOMETRY_FILE } from '../../scripts/lib/netlist-layout';
import { XLAYER_EXPLORER } from '../../src/config/env';
import { MAINNET_FACTORY, MAINNET_SINCE } from '../../src/config/facts';
import { DEPTHS, NODES, THREAD, WIRES } from '../../src/home/netlist-geometry';
import { format } from '../../src/i18n/core';
import { formatDay } from '../../src/lib/format';
import { explorerAddress } from '../../src/lib/links';
import { messages as home } from '../../src/messages/home.messages';
import { outOf } from './paths';

/** The text a reader sees: tags and React's `<!-- -->` separators removed. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, '');
const jsFiles = (root: string): string[] =>
  readdirSync(join(root, '_next'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(root, '_next', f));
/** The first two dots of the weave: a string only the drawing has, once it is drawn. */
const MARKER = `M${NODES[0]} ${NODES[1]}h0M${NODES[2]} ${NODES[3]}h0`;
/**
 * The geometry itself, as a minifier prints an array of whole numbers: what a chunk would hold if a client module
 * imported weave-svg, weave-path or netlist-geometry. MARKER cannot catch that, since the path strings only exist once
 * the code has run.
 */
const DATA = [NODES.slice(0, 16).join(','), WIRES.slice(0, 15).join(','), THREAD.join(',')];

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} home`, () => {
    const html = () => readFileSync(join(outOf(target), 'index.html'), 'utf8');
    /** The hero's fact strip, from its <ul> to its </ul>. */
    const facts = () => {
      const page = html();
      const at = page.indexOf('data-testid="hero-facts"');
      expect(at).toBeGreaterThan(0);
      return page.slice(page.lastIndexOf('<ul', at), page.indexOf('</ul>', at) + 5);
    };

    it('prerenders the weave of the real netlist and ships none of its numbers as JavaScript', () => {
      const page = html();
      expect(page).toMatch(/<div class="weave" aria-hidden="true">/);
      expect(page.match(/class="weave-col"/g)).toHaveLength(DEPTHS);
      expect(page).toContain(
        '<div data-weave="thread" class="weave-layer" style="view-transition-name:atropyle-thread">',
      );
      // Once in the DOM and once in Next's payload of the same page, never a third time.
      const copies = page.split(MARKER).length - 1;
      expect(copies).toBeGreaterThanOrEqual(1);
      expect(copies).toBeLessThanOrEqual(2);
      // The data markers are written as the generated module writes them, so a chunk that bundled it would hold them.
      const source = readFileSync(GEOMETRY_FILE, 'utf8');
      for (const m of DATA) expect(source).toContain(m);
      for (const file of jsFiles(outOf(target))) {
        const js = readFileSync(file, 'utf8');
        expect(js, file).not.toContain(MARKER);
        for (const m of DATA) expect(js, file).not.toContain(m);
      }
      // The weave's CSS is in globals.css: still one render-blocking stylesheet.
      expect(page.match(/<link[^>]*rel="stylesheet"/g)).toHaveLength(1);
      // The baseline of Task 5′ (at most 4 kB gzip more): the T4 report records these two numbers.
      console.info(`${target} index.html: ${page.length} B, ${gzipSync(page).length} B gzip`);
    });

    it('opens on the question with no eyebrow, and states three static facts with the door for heirs', () => {
      const page = html();
      const main = page.slice(page.indexOf('<main'));
      expect(main.slice(main.indexOf('<section'))).toMatch(/^<section[^>]*><div[^>]*><div[^>]*><h1/);
      const strip = facts();
      const text = textOf(strip);
      expect(text).toContain(home.en.heroFactCustody);
      expect(text).toContain(format(home.en.heroFactLive, { date: formatDay(MAINNET_SINCE, 'en') }));
      expect(text).toContain(home.en.heroHeirDoor);
      expect(strip).toContain('href="/verify/"');
      const factory = explorerAddress(XLAYER_EXPLORER, MAINNET_FACTORY);
      if (target === 'vercel') {
        expect(strip).toContain(`href="${factory}"`);
      } else {
        // DeWEB: text until mount, no external href in the HTML (Quyết định 16, html-purity.test.ts).
        expect(strip).not.toContain(factory);
        expect(strip).toContain('data-external="pending"');
      }
    });
  });
}
