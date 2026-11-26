import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '../../src/api/types';
import { formatAge, healthRows, okbText, worstTone } from '../../src/app/status/health';

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
});
