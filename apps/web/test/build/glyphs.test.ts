import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingGlyphs } from '../helpers/glyphs';
import { outOf } from './paths';

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** A field's placeholder, which the page draws in its own font. */
const PLACEHOLDER = /\splaceholder="([^"]*)"/gi;

/**
 * The text a reader sees in the page's fonts: scripts, styles, templates and the tab title (the browser's own UI
 * draws it) removed, placeholders kept, entities decoded. React escapes only the entities below and numeric ones.
 */
function visibleText(html: string): string {
  const placeholders = [...html.matchAll(PLACEHOLDER)].map((m) => m[1]).join(' ');
  return `${html} ${placeholders}`
    .replace(/<(script|style|template|title)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} glyphs`, () => {
    it('draws every character of every prerendered page in the self-hosted fonts, never in a system font', () => {
      const out = outOf(target);
      const pages = htmlFiles(out);
      expect(pages.map((p) => relative(out, p).replaceAll('\\', '/'))).toEqual(
        expect.arrayContaining(['index.html', '404.html']),
      );
      const offending = pages
        .map(
          (p) => [relative(out, p).replaceAll('\\', '/'), missingGlyphs(visibleText(readFileSync(p, 'utf8')))] as const,
        )
        .filter(([, missing]) => missing.length > 0)
        .map(([page, missing]) => `${page}: ${missing.join(', ')}`);
      expect(offending).toEqual([]);
    });
  });
}
