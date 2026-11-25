// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messages as home } from '../../src/messages/home.messages';

const LANGS = ['en', 'vi'] as const;

/** Text as a reader hears it: a no-break space (glue() in home.messages.ts) is a space. */
const spoken = (s: string): string => s.replace(/\s+/g, ' ');

describe('the words of the home page', () => {
  it('keep "X Layer" on one line: every message glues the name with a no-break space', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(home[lang])) {
        // \s matches U+00A0 too, so a name glued or not is found; only the glued one passes.
        for (const [name] of text.matchAll(/X\s+Layer/gu)) expect(name, `${lang}.${key}`).toBe('X Layer');
      }
    }
  });

  it('say the custody fact once: in the fact strip, not again in the lead (spec §18.4.3 Task 4)', () => {
    for (const lang of LANGS) {
      const custody = spoken(home[lang].heroFactCustody).toLowerCase();
      expect(spoken(home[lang].heroLead).toLowerCase(), lang).not.toContain(custody);
    }
  });
});
