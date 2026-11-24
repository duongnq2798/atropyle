import { KEYS, type KV, readJson, writeJson } from '@/lib/store';
import type { RememberedWallet, WalletOption } from './types';

const SOURCES: ReadonlySet<string> = new Set(['eip6963', 'okxwallet', 'ethereum']);

/**
 * What discovery's `untrusted(text, max)` can give: up to `max` characters (code points, not UTF-16 units), or
 * `max` and the '…' it adds when it cuts.
 */
function fits(text: string, max: number): boolean {
  const n = Array.from(text).length;
  return n <= max || (n === max + 1 && text.endsWith('…'));
}

/** A stored entry, or null when it is not exactly what `remember` writes (storage is user-editable). */
export function reviveRemembered(raw: unknown): RememberedWallet | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { rdns, source, name } = raw as Record<string, unknown>;
  if (typeof source !== 'string' || !SOURCES.has(source)) return null;
  if (typeof name !== 'string' || !fits(name, 40)) return null;
  if (rdns === null) return { rdns: null, source: source as RememberedWallet['source'], name };
  if (typeof rdns !== 'string' || rdns.length === 0 || !fits(rdns, 100)) return null;
  return { rdns, source: source as RememberedWallet['source'], name };
}

/** The remembered wallet; a corrupt entry is removed (readJson). */
export function readRemembered(kv: KV): RememberedWallet | null {
  return readJson(kv, KEYS.wallet, reviveRemembered);
}

export function remember(kv: KV, option: WalletOption): void {
  // An rdns that cleaned to '' is kept as none, which reviveRemembered accepts; findRemembered matches either one by
  // source and name.
  const entry: RememberedWallet = { rdns: option.rdns || null, source: option.source, name: option.name };
  writeJson(kv, KEYS.wallet, entry);
}

export function forget(kv: KV): void {
  kv.remove(KEYS.wallet);
}
