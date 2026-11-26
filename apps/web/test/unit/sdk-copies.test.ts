import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sdk from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { sameAddress } from '../../src/lib/address';
import { DOCS_BASE_URL, errorDocsUrl } from '../../src/lib/docs';
import { formatDuration } from '../../src/lib/duration';
import { jsonStringify } from '../../src/lib/store';
import { untrusted } from '../../src/lib/untrusted';

const text = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Quyết định 13: the shell keeps small copies of SDK helpers so the home page never loads the SDK.
describe('local copies of SDK helpers', () => {
  it('untrusted.ts is a byte-for-byte copy of the SDK file', () => {
    expect(text('../../src/lib/untrusted.ts')).toBe(text('../../../../packages/sdk/src/untrusted.ts'));
  });

  it('untrusted cleans hostile text exactly like the SDK', () => {
    const inputs: unknown[] = ['USD\u{202E}C', 'a\u{200B}b', 'x'.repeat(100), '\u{E0041}tag', 'two\nlines', 42, null];
    for (const s of inputs) expect(untrusted(s), String(s)).toEqual(sdk.untrusted(s));
  });

  it('formatDuration matches the SDK', () => {
    const inputs: (number | bigint)[] = [
      0,
      1,
      59,
      60,
      61,
      3599,
      3600,
      86_399,
      86_400,
      90_061,
      1_000_000,
      -5,
      10n ** 6n,
    ];
    for (const s of inputs) expect(formatDuration(s), String(s)).toBe(sdk.formatDuration(s));
  });

  it('the docs links match the SDK', () => {
    expect(DOCS_BASE_URL).toBe(sdk.DOCS_BASE_URL);
    expect(errorDocsUrl('NOT_VAULT')).toBe(sdk.errorDocsUrl('NOT_VAULT'));
  });

  it('sameAddress matches the SDK', () => {
    const a = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const cases: [string | null, string | null][] = [
      [a, a.toLowerCase()],
      [a, null],
      [null, null],
      ['', ''],
      [a, '0x0000000000000000000000000000000000000000'],
    ];
    for (const [x, y] of cases) expect(sameAddress(x, y)).toBe(sdk.sameAddress(x, y));
  });

  it('jsonStringify matches the SDK stringify', () => {
    const v = { a: 1n, b: [2n, 'x', null], c: { d: 10n ** 30n, e: undefined }, f: true, g: new Uint8Array([1, 2]) };
    expect(jsonStringify(v)).toBe(sdk.stringify(v));
    expect(jsonStringify(v, 2)).toBe(sdk.stringify(v, 2));
  });
  it('the create page copies the Drill lifetime and the wizard steps', async () => {
    const { DRILL_LIFETIME_SECONDS } = await import('../../src/app/create/kind');
    const { CREATE_STEPS } = await import('../../src/app/create/progress');
    const { WIZARD_STEPS } = await import('../../src/flows/impl/wizard');
    expect(DRILL_LIFETIME_SECONDS).toBe(sdk.DRILL_LIFETIME_SECONDS);
    expect(CREATE_STEPS).toEqual(WIZARD_STEPS);
  });
});
