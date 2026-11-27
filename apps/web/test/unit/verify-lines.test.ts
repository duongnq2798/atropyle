import { describe, expect, it } from 'vitest';
import {
  commandWords,
  LINE_ROWS,
  lineLink,
  overallOf,
  p9SeedOf,
  verifyCommand,
  verifyLines,
} from '../../src/app/verify/lines';
import type { VaultVerification } from '../../src/verify/types';
import type { RowId, RowState, VerifyRow } from '../../src/verify/verify-view';

const IDS: readonly RowId[] = ['factory', 'proxy', 'binding', 'code', 'policy', 'operators'];
const rows = (over: Partial<Record<RowId, RowState>> = {}): VerifyRow[] =>
  IDS.map((id) => ({ id, state: over[id] ?? 'pass', detail: null }));

describe('the three lines of /verify/', () => {
  it('stands each line for its technical rows, every row exactly once', () => {
    expect(Object.values(LINE_ROWS).flat().sort()).toEqual([...IDS].sort());
    expect(verifyLines(rows(), false).map((l) => [l.id, l.rows.map((r) => r.id)])).toEqual([
      ['real', ['factory', 'proxy', 'code']],
      ['rules', ['binding', 'policy']],
      ['operators', ['operators']],
    ]);
  });

  it('reads "checking" on the rules line only while the proof runs; a failed row fails its line at once', () => {
    expect(verifyLines(rows({ policy: 'unknown' }), true).map((l) => l.state)).toEqual(['pass', 'checking', 'pass']);
    expect(verifyLines(rows({ policy: 'unknown' }), false).map((l) => l.state)).toEqual(['pass', 'unknown', 'pass']);
    expect(verifyLines(rows({ policy: 'unknown', binding: 'fail' }), true)[1].state).toBe('fail');
    expect(verifyLines(rows({ operators: 'unknown' }), true)[2].state).toBe('unknown');
  });

  it('gives one answer: a failure at once, pending while the proof runs, then pass or partial', () => {
    expect(overallOf(rows({ factory: 'fail', policy: 'unknown' }), true)).toBe('fail');
    expect(overallOf(rows({ policy: 'unknown' }), true)).toBe('pending');
    expect(overallOf(rows(), false)).toBe('pass');
    expect(overallOf(rows({ operators: 'unknown' }), false)).toBe('partial');
  });

  it('links each line to the explorer page that shows the same fact', () => {
    const o = { explorer: 'https://www.oklink.com/xlayer/', vault: '0xAb', cpu: '0xCd', block: 76_600_000n };
    expect(lineLink('real', o)).toBe('https://www.oklink.com/xlayer/address/0xAb');
    expect(lineLink('rules', o)).toBe('https://www.oklink.com/xlayer/address/0xCd');
    expect(lineLink('operators', o)).toBe('https://www.oklink.com/xlayer/block/76600000');
  });

  it('pins the command to the release, and to the P9 seed when the page drew one', () => {
    expect(verifyCommand('0.1.0', '0xAb', null)).toBe('npx -y atropyle@0.1.0 verify --vault 0xAb');
    expect(verifyCommand('0.1.0', '0xAb', 18_446_744_073_709_551_615n)).toBe(
      'npx -y atropyle@0.1.0 verify --vault 0xAb --p9-seed 18446744073709551615',
    );
    const verified = (p9: unknown) =>
      ({ policy: { status: 'verified', result: { p9 }, unchanged: true } }) as unknown as VaultVerification;
    expect(p9SeedOf(verified({ seed: 7n }))).toBe(7n);
    expect(p9SeedOf(verified(null))).toBeNull();
    expect(p9SeedOf({ policy: { status: 'skipped' } } as unknown as VaultVerification)).toBeNull();
  });

  it('lets only the address break inside a word: a flag never splits at its hyphen', () => {
    const cmd = verifyCommand('0.1.0', '0x5FbDB2315678afecb367f032d93F642f64180aa3', 20_261_125n);
    const words = commandWords(cmd);
    expect(words.map((w) => w.text).join(' ')).toBe(cmd);
    expect(words.filter((w) => w.long).map((w) => w.text)).toEqual(['0x5FbDB2315678afecb367f032d93F642f64180aa3']);
  });
});
