import type { HealthResponse } from '@/api/types';
import type { Lang } from '@/i18n/core';

export const INDEXER_STALE_SEC = 300;
export const INDEXER_LAG_BLOCKS = 100;
export const INTEGRITY_STALE_SEC = 1800;
export const KEEPER_STALE_SEC = 300;
/** 0.005 OKB. */
export const KEEPER_LOW_WEI = 5_000_000_000_000_000n;

export type HealthId = 'indexer' | 'integrity' | 'keeper';
export type HealthTone = 'ok' | 'warn' | 'bad' | 'unknown';
export type HealthText =
  | 'indexerFresh'
  | 'indexerStale'
  | 'indexerLagging'
  | 'integrityFresh'
  | 'integrityStale'
  | 'integrityFailed'
  | 'keeperFresh'
  | 'keeperStale'
  | 'keeperDryRun'
  | 'keeperLowGas'
  | 'healthNone';

export interface HealthRow {
  id: HealthId;
  tone: HealthTone;
  text: HealthText;
  ageSec: number | null;
  block: string | null;
  lag: number | null;
  okb: string | null;
}

const ageOf = (iso: string, nowMs: number): number | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((nowMs - t) / 1000));
};

const weiOf = (s: string): bigint | null => {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
};

/** Four decimals, rounded down: 1234567000000000000n → "1.2345". */
export function okbText(wei: bigint): string {
  const unit = 10n ** 18n;
  return `${wei / unit}.${((wei % unit) / 10n ** 14n).toString().padStart(4, '0')}`;
}

/** "2 minutes", "2 giờ": the largest whole unit, rounded down. */
export function formatAge(sec: number, lang: Lang): string {
  const [value, unit] =
    sec < 60
      ? [sec, 'second']
      : sec < 3600
        ? [Math.floor(sec / 60), 'minute']
        : sec < 86_400
          ? [Math.floor(sec / 3600), 'hour']
          : [Math.floor(sec / 86_400), 'day'];
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { style: 'unit', unit, unitDisplay: 'long' }).format(
    value,
  );
}

const none = (id: HealthId): HealthRow => ({
  id,
  tone: 'unknown',
  text: 'healthNone',
  ageSec: null,
  block: null,
  lag: null,
  okb: null,
});

/** Quyết định 17 of Plan 7C. The thresholds only colour a row; nothing on the site depends on them. */
export function healthRows(h: HealthResponse, nowMs: number): HealthRow[] {
  const rows: HealthRow[] = [];

  const ia = ageOf(h.indexer.updatedAt, nowMs);
  // Before the first tick the backend answers block '0' at the epoch (apps/backend: health placeholder): no report yet.
  if (ia === null || h.indexer.block === '0') rows.push(none('indexer'));
  else {
    const base = { id: 'indexer' as const, ageSec: ia, block: h.indexer.block, lag: h.indexer.lagBlocks, okb: null };
    if (ia > INDEXER_STALE_SEC) rows.push({ ...base, tone: 'warn', text: 'indexerStale' });
    else if (h.indexer.lagBlocks > INDEXER_LAG_BLOCKS) rows.push({ ...base, tone: 'warn', text: 'indexerLagging' });
    else rows.push({ ...base, tone: 'ok', text: 'indexerFresh' });
  }

  const ig = h.integrity;
  const ga = ig ? ageOf(ig.at, nowMs) : null;
  if (!ig || ga === null) rows.push(none('integrity'));
  else {
    const base = { id: 'integrity' as const, ageSec: ga, block: ig.block, lag: null, okb: null };
    if (!ig.ok) rows.push({ ...base, tone: 'bad', text: 'integrityFailed' });
    else if (ga > INTEGRITY_STALE_SEC) rows.push({ ...base, tone: 'warn', text: 'integrityStale' });
    else rows.push({ ...base, tone: 'ok', text: 'integrityFresh' });
  }

  const k = h.keeper;
  const ka = k ? ageOf(k.lastRunAt, nowMs) : null;
  const wei = k ? weiOf(k.balanceWei) : null;
  if (!k || ka === null || wei === null) rows.push(none('keeper'));
  else {
    const base = { id: 'keeper' as const, ageSec: ka, block: null, lag: null, okb: okbText(wei) };
    if (k.dryRun) rows.push({ ...base, tone: 'warn', text: 'keeperDryRun' });
    else if (ka > KEEPER_STALE_SEC) rows.push({ ...base, tone: 'warn', text: 'keeperStale' });
    else if (wei < KEEPER_LOW_WEI) rows.push({ ...base, tone: 'warn', text: 'keeperLowGas' });
    else rows.push({ ...base, tone: 'ok', text: 'keeperFresh' });
  }
  return rows;
}

const RANK: Record<HealthTone, number> = { ok: 0, unknown: 1, warn: 2, bad: 3 };

/** The tone of the glance: the worst of its rows ('ok' for none). */
export function worstTone(tones: readonly HealthTone[]): HealthTone {
  return tones.reduce<HealthTone>((w, t) => (RANK[t] > RANK[w] ? t : w), 'ok');
}
