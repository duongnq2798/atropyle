// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HERO_CASES } from '../../src/home/hero-cases';
import { RELEASE } from '../../src/home/hero-circuit';
import { messages as ask } from '../../src/messages/ask.messages';
import { messages as home } from '../../src/messages/home.messages';

const LANGS = ['en', 'vi'] as const;

/** Text as a reader hears it: a no-break space (glue() in home.messages.ts) is a space. */
const spoken = (s: string): string => s.replace(/\s+/g, ' ');

describe('the words of the home page', () => {
  it('keep "X Layer" on one line: every message glues the name with a no-break space', () => {
    for (const [file, m] of [
      ['home', home],
      ['ask', ask],
    ] as const) {
      for (const lang of LANGS) {
        for (const [key, text] of Object.entries(m[lang])) {
          // \s matches U+00A0 too, so a name glued or not is found; only the glued one passes.
          for (const [name] of text.matchAll(/X\s+Layer/gu)) expect(name, `${file}.${lang}.${key}`).toBe('X Layer');
        }
      }
    }
  });

  it('say the custody fact once: in the fact strip, not again in the lead (spec §18.4.3 Task 4)', () => {
    for (const lang of LANGS) {
      const custody = spoken(home[lang].heroFactCustody).toLowerCase();
      expect(spoken(home[lang].heroLead).toLowerCase(), lang).not.toContain(custody);
    }
  });

  it('answer each question as the circuit does: the gate opens only where RELEASE says so', () => {
    const KEY = { alive: 'answerAlive', silent: 'answerSilent', liar: 'answerLiar' } as const;
    for (const c of HERO_CASES) {
      expect(home.en[KEY[c]].includes('gate opens'), c).toBe(RELEASE[c]);
      expect(home.en[KEY[c]].includes('gate stays closed'), c).toBe(!RELEASE[c]);
      expect(spoken(home.vi[KEY[c]]).includes('Cổng mở'), c).toBe(RELEASE[c]);
      expect(spoken(home.vi[KEY[c]]).includes('Cổng vẫn đóng'), c).toBe(!RELEASE[c]);
    }
    expect(ask.en.matchOpen).toContain('the gate opens');
    expect(ask.en.matchClosed).toContain('the gate stays closed');
  });
});
