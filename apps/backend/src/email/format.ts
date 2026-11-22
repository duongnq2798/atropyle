import type { AssetKind } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Lang } from '../types';
import { COPY } from './copy';
import { escapeHtml, fill } from './fill';
import { FONTS, LIGHT } from './theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VIETNAM_OFFSET_MS = 7 * 3600 * 1000;
const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
const dmy = (d: Date) => `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/**
 * A chain time (Unix seconds) for an email. EN: "Mon 23 Nov 2026, 14:05 UTC". VI adds Vietnam time (UTC+7), since
 * the backend never knows a reader's own time zone (plan ruling 9, spec §9.4).
 */
export function formatDeadline(at: bigint, lang: Lang): string {
  const d = new Date(Number(at) * 1000);
  if (lang === 'en') {
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hhmm(d)} UTC`;
  }
  const v = new Date(d.getTime() + VIETNAM_OFFSET_MS);
  return `${hhmm(d)} UTC, ${dmy(d)} (${hhmm(v)}, ${dmy(v)} giờ Việt Nam)`;
}

/** 0x3C44…93BC: for subjects and short mentions. The full value is always printed elsewhere in the email. */
export function shortHex(h: string, head = 6, tail = 4): string {
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

/** "0x 3C44 CdDd …": four-character groups, easy to compare with the vault page. */
export function groupAddress(a: string): string {
  return `0x ${(a.slice(2).match(/.{1,4}/g) ?? []).join(' ')}`;
}

/** One payout of a Distributed event. Token names and symbols are never shown: they come from the chain. */
export interface Transfer {
  kind: AssetKind | 'unknown';
  token: Address | null;
  to: Address;
  /** Display amount: ERC-20 in token units (decimals applied when known), ERC-1155 count. */
  amount: string | null;
  /** ERC-721 or ERC-1155 token id; the asset index for an unknown asset. */
  id: string | null;
}

export function transferLines(transfers: readonly Transfer[], lang: Lang): string[] {
  const f = COPY[lang].fragments;
  return transfers.map((t) => {
    const vars = { amount: t.amount ?? '', token: t.token ?? '', id: t.id ?? '', to: t.to };
    if (t.kind === 'erc20') return fill(f.transferErc20, vars, 'text');
    if (t.kind === 'erc721') return fill(f.transferErc721, vars, 'text');
    if (t.kind === 'erc1155') return fill(f.transferErc1155, vars, 'text');
    return fill(f.transferUnknown, vars, 'text');
  });
}

const LINE_STYLE = [
  `font-family:${FONTS.mono}`,
  'font-size:14px',
  'line-height:22px',
  `color:${LIGHT.ink}`,
  'margin:4px 0 10px',
  'word-break:break-all',
].join(';');

/** The only raw HTML an email receives ({{{transfersHtml}}}): fixed markup around escaped lines. */
export function transfersHtml(lines: readonly string[]): string {
  return lines.map((l) => `<p class="at-ink" style="${LINE_STYLE}">${escapeHtml(l)}</p>`).join('');
}
