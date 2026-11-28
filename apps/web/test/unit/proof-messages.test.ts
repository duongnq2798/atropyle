import { STATE_CODES } from '@atropyle/sdk';
import { P9_VECTORS } from '@atropyle/sdk/verify';
import { hexToBytes, hexToNumber } from 'viem';
import { describe, expect, it } from 'vitest';
import { metadata } from '../../src/app/proof/page';
import { STEP_EXAMPLE } from '../../src/content/commands';
import { formatCount } from '../../src/lib/count';
import { messages } from '../../src/messages/proof.messages';
import { TOTAL_CASES } from '../../src/proof/paint';

const LANGS = ['en', 'vi'] as const;
type Key = keyof typeof messages.en;

/** Names that carry digits but state no number: the rules, a hash function, a contract, a test suite. */
const NAMES = /\bP[1-9]\b|keccak256|Multicall3|TAP-02/g;
/** The digit runs of a text once its placeholders and its names are gone. */
const digitsOf = (text: string) =>
  [
    ...text
      .replace(/\{\w+\}/g, '')
      .replace(NAMES, '')
      .matchAll(/\d+/g),
  ].map((m) => m[0]);

/** Three state bits give the codes 0 to 7; the SDK names the five a vault can hold. */
const UNUSED = Array.from({ length: 2 ** 3 }, (_, code) => code)
  .filter((code) => !Object.values(STATE_CODES).includes(code))
  .map(String);

/** Spec §18.4.3 (Task 3), word for word. */
const P8 =
  'The netlist stored in the processor on X Layer, run on this device, answers exactly like the reference model for every input.';

describe('proof messages', () => {
  it('type no number by hand: each digit is a placeholder, a name, or a value this test computes', () => {
    // "From state 0 with every input at 0": the state and the inputs of the cast example.
    expect(hexToBytes(STEP_EXAMPLE.inputs).every((b) => b === 0)).toBe(true);
    const tied: Partial<Record<Key, string[]>> = {
      legendUnused: UNUSED,
      limit2Do: [String(hexToNumber(STEP_EXAMPLE.state)), '0'],
    };
    for (const lang of LANGS) {
      for (const key of Object.keys(messages[lang]) as Key[]) {
        expect(digitsOf(messages[lang][key]), `${lang}.${key}`).toEqual(tied[key] ?? []);
      }
    }
  });

  it('never counts the rules as eight, never says assets were moved, and states P8 as the spec does', () => {
    for (const lang of LANGS) {
      for (const key of Object.keys(messages[lang]) as Key[]) {
        expect(messages[lang][key], `${lang}.${key}`).not.toMatch(/eight rules|tám luật|đã chuyển/i);
      }
    }
    // The spec's words; "X Layer" is bound with a no-break space on the page (vi-compounds-showcase.test.ts).
    expect(messages.en.P8.replaceAll('\u00A0', ' ')).toBe(P8);
  });

  it('gives search engines the numbers of the page, from the same constants', () => {
    expect(digitsOf(String(metadata.description))).toEqual(digitsOf(`${formatCount(TOTAL_CASES, 'en')} ${P9_VECTORS}`));
  });
});
