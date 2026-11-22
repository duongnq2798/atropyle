import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleSource, renderAll } from '../../emails/render';
import { SECOND_STRAND, segments } from '../../emails/Thread';
import { COPY } from '../../src/email/copy';
import { EMAIL_KINDS, PLACEHOLDERS, THREAD } from '../../src/email/kinds';
import { TEMPLATES } from '../../src/email/templates.gen';
import { LANGS } from '../../src/types';

const GEN = fileURLToPath(new URL('../../src/email/templates.gen.ts', import.meta.url));
const SLOT = /\{\{\{([A-Za-z]+)\}\}\}|\{\{([A-Za-z]+)\}\}/g;
const slots = (s: string) => [...s.matchAll(SLOT)].map((m) => ({ raw: m[1] !== undefined, name: m[1] ?? m[2] }));

describe('generated email templates (spec §9.4)', () => {
  it('match the React Email source: run `npm run emails -w apps/backend` after any change', async () => {
    const want = moduleSource(await renderAll());
    expect(readFileSync(GEN, 'utf8').replace(/\r\n/g, '\n')).toBe(want);
  });

  for (const kind of EMAIL_KINDS) {
    for (const lang of LANGS) {
      describe(`${kind}.${lang}`, () => {
        const t = TEMPLATES[kind][lang];

        it('has exactly one button to the action URL and one unsubscribe link', () => {
          const hrefs = [...t.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
          expect(hrefs.sort()).toEqual(['{{actionUrl}}', '{{unsubscribeUrl}}']);
        });

        it('declares its language and the dark palette, and loads nothing', () => {
          expect(t.html).toContain(`lang="${lang}"`);
          expect(t.html).toContain('@media (prefers-color-scheme: dark)');
          expect(t.html).not.toMatch(/<img|\ssrc=|url\(|@import|<link/i);
        });

        it('says that Atropyle never asks for a signature by email', () => {
          expect(t.html).toContain(COPY[lang].footer.never);
          expect(t.text).toContain(COPY[lang].footer.never);
        });

        it('uses only known placeholders, and raw HTML only for the payout list', () => {
          for (const s of [...slots(t.subject), ...slots(t.html), ...slots(t.text)]) {
            expect(PLACEHOLDERS as readonly string[]).toContain(s.name);
          }
          expect(slots(t.subject).some((s) => s.raw)).toBe(false);
          expect(slots(t.text).some((s) => s.raw)).toBe(false);
          expect(
            slots(t.html)
              .filter((s) => s.raw)
              .map((s) => s.name),
          ).toEqual(kind === 'distributed' ? ['transfersHtml'] : []);
        });

        it('prints the vault address and the role for comparison', () => {
          expect(t.html).toContain('{{vaultGrouped}}');
          expect(t.html).toContain('{{roleLabel}}');
          expect(t.text).toContain('{{vault}}');
          expect(t.text).toContain('{{actionUrl}}');
          expect(t.text).toContain('{{unsubscribeUrl}}');
          expect(t.text).not.toMatch(/<[a-z]/i);
        });
      });
    }
  }

  it('draws every thread with cells that add up to 100%', () => {
    for (const kind of EMAIL_KINDS) {
      const { progress, shape } = THREAD[kind];
      for (const cells of [segments(progress, shape), SECOND_STRAND]) {
        expect(
          cells.reduce((n, s) => n + s.width, 0),
          kind,
        ).toBe(100);
        expect(new Set(cells.map((s) => s.id)).size, kind).toBe(cells.length);
      }
    }
  });

  it('never links to the create page: every button goes to the action URL (vault page, confirm page)', () => {
    for (const kind of EMAIL_KINDS) {
      for (const lang of LANGS) {
        expect(TEMPLATES[kind][lang].html, `${kind}.${lang}`).not.toContain('/create/');
        expect(TEMPLATES[kind][lang].text, `${kind}.${lang}`).not.toContain('/create/');
      }
    }
  });
});
