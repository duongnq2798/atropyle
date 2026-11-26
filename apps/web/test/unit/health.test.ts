import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '../../src/api/types';
import { backendTone, contractsTone, formatAge, healthRows, okbText, worstTone } from '../../src/app/status/health';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();
const GOOD: HealthResponse = {
  indexer: { block: '5000', lagBlocks: 3, updatedAt: ago(60) },
  integrity: { at: ago(600), block: '4990', ok: true },
  keeper: { lastRunAt: ago(120), balanceWei: '20000000000000000', dryRun: false },
};
const tones = (h: HealthResponse) => healthRows(h, NOW).map((r) => `${r.id} ${r.tone} ${r.text}`);

describe('backend health', () => {
  it('reads fresh reports as fine', () => {
    expect(tones(GOOD)).toEqual(['indexer ok indexerFresh', 'integrity ok integrityFresh', 'keeper ok keeperFresh']);
    expect(healthRows(GOOD, NOW)[2]).toMatchObject({ ageSec: 120, okb: '0.0200' });
  });

  it('flags stale, lagging, failed, dry-run and low-gas reports, and missing ones as unknown', () => {
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, updatedAt: ago(301) } })[0]).toBe('indexer warn indexerStale');
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, lagBlocks: 101 } })[0]).toBe('indexer warn indexerLagging');
    expect(tones({ ...GOOD, integrity: { ...GOOD.integrity!, ok: false } })[1]).toBe('integrity bad integrityFailed');
    expect(tones({ ...GOOD, integrity: { ...GOOD.integrity!, at: ago(1801) } })[1]).toBe(
      'integrity warn integrityStale',
    );
    expect(tones({ ...GOOD, keeper: { ...GOOD.keeper!, dryRun: true } })[2]).toBe('keeper warn keeperDryRun');
    expect(tones({ ...GOOD, keeper: { ...GOOD.keeper!, lastRunAt: ago(301) } })[2]).toBe('keeper warn keeperStale');
    expect(tones({ ...GOOD, keeper: { ...GOOD.keeper!, balanceWei: '4999999999999999' } })[2]).toBe(
      'keeper warn keeperLowGas',
    );
    expect(tones({ ...GOOD, integrity: null, keeper: null }).slice(1)).toEqual([
      'integrity unknown healthNone',
      'keeper unknown healthNone',
    ]);
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, updatedAt: 'garbage' } })[0]).toBe(
      'indexer unknown healthNone',
    );
  });

  it('says one block behind as one block, never "1 blocks"', () => {
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, lagBlocks: 1 } })[0]).toBe('indexer ok indexerFreshOne');
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, lagBlocks: 0 } })[0]).toBe('indexer ok indexerFresh');
  });

  it('formats gas and ages for people', () => {
    expect(okbText(1_234_567_000_000_000_000n)).toBe('1.2345');
    expect(formatAge(45, 'en')).toBe('45 seconds');
    expect(formatAge(130, 'en')).toBe('2 minutes');
    expect(formatAge(7200, 'vi')).toBe('2 giờ');
  });

  it('reads the backend placeholder before its first tick as no report', () => {
    const placeholder = { block: '0', lagBlocks: 0, updatedAt: '1970-01-01T00:00:00.000Z' };
    expect(tones({ ...GOOD, indexer: placeholder })[0]).toBe('indexer unknown healthNone');
  });

  it('names the worst tone for the glance', () => {
    expect(worstTone([])).toBe('ok');
    expect(worstTone(['ok', 'unknown'])).toBe('unknown');
    expect(worstTone(['ok', 'warn', 'unknown'])).toBe('warn');
    expect(worstTone(['warn', 'bad', 'ok'])).toBe('bad');
  });

  it('reads a failed read as unknown, and keeps red for a check that failed', () => {
    expect(contractsTone({ ok: true }, false)).toBe('ok');
    expect(contractsTone({ ok: false }, false)).toBe('bad');
    // The RPC did not answer: nothing says the contracts are wrong (fix round 1).
    expect(contractsTone(undefined, true)).toBe('unknown');
    expect(contractsTone(undefined, false)).toBeNull();
    // A report in hand wins over a later failed refetch.
    expect(contractsTone({ ok: true }, true)).toBe('ok');
  });

  it('reads the backend glance: off where there is none, unknown when it does not answer', () => {
    expect(backendTone({ hosted: false, rows: null, failed: true, idle: false })).toBe('off');
    expect(backendTone({ hosted: true, rows: null, failed: true, idle: false })).toBe('unknown');
    expect(backendTone({ hosted: true, rows: null, failed: false, idle: true })).toBe('off');
    expect(backendTone({ hosted: true, rows: null, failed: false, idle: false })).toBeNull();
    expect(backendTone({ hosted: true, rows: healthRows(GOOD, NOW), failed: false, idle: false })).toBe('ok');
    const failed = { ...GOOD, integrity: { ...GOOD.integrity!, ok: false } };
    expect(backendTone({ hosted: true, rows: healthRows(failed, NOW), failed: false, idle: false })).toBe('bad');
  });
});
