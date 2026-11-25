// Read-only health report for the maintainer (npm run daily:check). It reads the chain and fetches the site; it never
// signs or sends anything, and needs no key.
import { type Address, encodeFunctionData, formatUnits, getAddress, type Hex, type PublicClient } from 'viem';
import { factoryAbi, vaultAbi } from '../../packages/sdk/src/abi/index';
import { sameAddress } from '../../packages/sdk/src/address';
import type { Deployment } from '../../packages/sdk/src/deployments/index';
import type { TeamMember } from '../../packages/sdk/src/deployments/teams';
import { formatDuration } from '../../packages/sdk/src/duration';
import { decodeError } from '../../packages/sdk/src/errors';
import { createReadContext } from '../../packages/sdk/src/read/context';
import { type ChainCounters, readCounters } from '../../packages/sdk/src/read/counters';

export type CheckStatus = 'ok' | 'attention' | 'skipped';

export interface CheckRow {
  check: string;
  status: CheckStatus;
  detail: string;
}

export interface KeeperTx {
  blockNumber: bigint;
  timestamp: bigint;
  hash: Hex;
  to: Address | null;
  action: 'poke' | 'distribute' | 'other';
}

export interface DailyReport {
  chainId: number;
  blockNumber: bigint | null;
  blockTimestamp: bigint | null;
  rows: CheckRow[];
  /** At least one row needs attention: the command exits with 1. */
  attention: boolean;
  counters: ChainCounters | null;
  keeper: { address: Address; balance: bigint | null; last: KeeperTx | null; sent: number | null } | null;
  drill: { vault: Address; expiresAt: bigint; secondsLeft: bigint } | null;
  /** `status` is the last answer (a 3xx when it redirects to another host); `finalUrl` is the URL that gave it. */
  site: { url: string; status: number | null; finalUrl: string | null } | null;
}

export interface DailyCheckInput {
  client: PublicClient;
  deployment: Deployment;
  team: readonly TeamMember[];
  keeper?: Address | null;
  /** The public Drill vault; found among the vaults the team owns when not given. */
  drill?: Address | null;
  siteUrl?: string | null;
  /** How far back to look for the keeper's last transaction. */
  keeperBlocks?: bigint;
  fetch?: typeof fetch;
}

/** Under this the keeper may soon fail to pay gas: 0.01 OKB. */
export const MIN_KEEPER_BALANCE = 10n ** 16n;
/** A Drill that expires sooner needs a fresh one: 24 hours. */
export const DRILL_WARN_SECONDS = 86_400n;
/** About one day of X Layer blocks (one per second). */
export const DEFAULT_KEEPER_BLOCKS = 86_400n;
const SITE_TIMEOUT_MS = 15_000;
/** Redirects followed on the site's own host (http to https, a trailing slash) before giving up. */
const MAX_SITE_REDIRECTS = 5;
/**
 * The built app's <title> starts with its name: "Atropyle" (apps/web-legacy) or "Atropyle: ..." (apps/web). A parked
 * or forwarded domain answers 200 with its own page, whose title is empty, the domain name or an ad.
 */
export const APP_TITLE = /<title[^>]*>\s*Atropyle(?![\w.])/;
/** Earlier transactions inspected when the newest ones are neither poke nor distribute. */
const MAX_TX_BACK = 5;

const SELECTORS = {
  poke: encodeFunctionData({ abi: vaultAbi, functionName: 'poke' }),
  distribute: encodeFunctionData({ abi: vaultAbi, functionName: 'distribute' }),
};

function actionOf(input: Hex): KeeperTx['action'] {
  const s = input.slice(0, 10).toLowerCase();
  if (s === SELECTORS.poke) return 'poke';
  if (s === SELECTORS.distribute) return 'distribute';
  return 'other';
}

function why(e: unknown): string {
  const err = decodeError(e);
  return `${err.code}: ${err.message}`.slice(0, 160);
}

/** Node's fetch says only "fetch failed"; the reason (a timeout, DNS, TLS) is in its cause. */
function fetchFailure(e: unknown): string {
  const err = e as { message?: unknown; cause?: { code?: unknown; message?: unknown } };
  const cause = err?.cause?.code ?? err?.cause?.message;
  const text = `${String(err?.message ?? e)}${cause ? ` (${String(cause)})` : ''}`;
  return text.slice(0, 160);
}

interface SiteProbe {
  ok: boolean;
  detail: string;
  status: number | null;
  finalUrl: string | null;
}

/**
 * GET `url` and follow redirects by hand, only on its own host (http may upgrade to https, never the reverse): a
 * redirect to another host is how a domain forwarder or a parking page answers. The final 200 must also carry the
 * app's <title>. Throws only when a request fails (timeout, DNS, TLS).
 */
export async function probeSite(url: string, fetchFn: typeof fetch): Promise<SiteProbe> {
  const t0 = Date.now();
  const signal = AbortSignal.timeout(SITE_TIMEOUT_MS);
  const start = new URL(url);
  let at = start;
  for (let hop = 0; ; hop++) {
    const res = await fetchFn(at.href, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': 'atropyle-daily-check' },
    });
    const got = { status: res.status, finalUrl: at.href };
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const location = res.headers.get('location');
      if (!location) return { ...got, ok: false, detail: `${at.href} answered HTTP ${res.status} with no Location` };
      const next = new URL(location, at);
      if (next.host !== start.host) {
        return {
          ...got,
          ok: false,
          detail: `${at.href} redirects to ${next.href}, another host (a forwarder or a parked domain?): point the DNS at the site, or pass --site ${next.href} if that host is the site`,
        };
      }
      if (at.protocol === 'https:' && next.protocol !== 'https:') {
        return { ...got, ok: false, detail: `${at.href} redirects to ${next.href}, off HTTPS` };
      }
      if (hop >= MAX_SITE_REDIRECTS) {
        return { ...got, ok: false, detail: `${url} redirects more than ${MAX_SITE_REDIRECTS} times` };
      }
      at = next;
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      return { ...got, ok: false, detail: `${at.href} answered HTTP ${res.status}` };
    }
    const via = at.href === start.href ? '' : ` (via ${at.href})`;
    if (!APP_TITLE.test(await res.text())) {
      return {
        ...got,
        ok: false,
        detail: `${url} answered 200${via} but not with the Atropyle app (no <title> starting with Atropyle): a parked or forwarded domain?`,
      };
    }
    return { ...got, ok: true, detail: `${url} answered 200${via} in ${Date.now() - t0} ms` };
  }
}

export function formatUtc(ts: bigint): string {
  return `${new Date(Number(ts) * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

const usd = (raw: bigint, decimals: number) => {
  const cents = decimals >= 2 ? raw / 10n ** BigInt(decimals - 2) : raw * 10n ** BigInt(2 - decimals);
  return `$${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
};

export function countersDetail(c: ChainCounters): string {
  const pair = (p: { all: number; outsideTeam: number }) => `${p.all} (${p.outsideTeam} outside the team)`;
  const s = c.stablecoins;
  const parts = [
    `vaults ${pair(c.vaults)}, free Drills included`,
    `paid ${pair(c.paid)}`,
    // State released, not "swept": a vault keeps no record of distribute() that a view function can read.
    `released ${pair(c.releases)}`,
    `stablecoins ${usd(s.all, s.decimals)} (${usd(s.outsideTeam, s.decimals)} outside the team)`,
  ];
  if (!c.complete) parts.push(`released and stablecoins are lower bounds: ${c.read} of ${c.vaults.all} vaults read`);
  if (!c.teamComplete) parts.push('team index not read to its end');
  return parts.join('; ');
}

/**
 * The keeper's newest poke or distribute in (head - blocks, head], found by bisecting its account nonce over block
 * numbers (a few dozen eth_getTransactionCount calls, no log scan: a keeper poke often emits no event). Looks at most
 * MAX_TX_BACK transactions back; when none of them is a poke or distribute, `last` is the newest one.
 */
export async function lastKeeperTx(
  client: PublicClient,
  keeper: Address,
  head: bigint,
  blocks: bigint,
): Promise<{ sent: number; last: KeeperTx | null }> {
  const lo = head > blocks ? head - blocks : 0n;
  const nonceAt = (blockNumber: bigint) => client.getTransactionCount({ address: keeper, blockNumber });
  const [top, bottom] = await Promise.all([nonceAt(head), nonceAt(lo)]);
  let last: KeeperTx | null = null;
  let hi = head;
  for (let k = top; k > bottom && top - k < MAX_TX_BACK; k--) {
    // Smallest block whose nonce is at least k: it holds the transaction with nonce k - 1.
    let a = lo;
    let b = hi;
    while (b - a > 1n) {
      const m = (a + b) / 2n;
      if ((await nonceAt(m)) >= k) b = m;
      else a = m;
    }
    const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
    const tx = block.transactions.find((t) => sameAddress(t.from, keeper) && t.nonce === k - 1);
    if (!tx) break;
    const found: KeeperTx = {
      blockNumber: b,
      timestamp: block.timestamp,
      hash: tx.hash,
      to: tx.to ? getAddress(tx.to) : null,
      action: actionOf(tx.input),
    };
    if (found.action !== 'other') return { sent: top - bottom, last: found };
    last ??= found;
    hi = b;
  }
  return { sent: top - bottom, last };
}

/** The team-owned Drill that lives longest: the public one, unless the maintainer names another. */
async function findDrill(
  client: PublicClient,
  d: Deployment,
  team: readonly TeamMember[],
  blockNumber: bigint,
): Promise<{ vault: Address; expiresAt: bigint } | null> {
  const f = { address: d.factory, abi: factoryAbi, blockNumber } as const;
  let best: { vault: Address; expiresAt: bigint } | null = null;
  for (const m of team) {
    const n = await client.readContract({ ...f, functionName: 'vaultsOfLength', args: [m.address] });
    const count = n < 100n ? n : 100n;
    const list = await client.readContract({ ...f, functionName: 'vaultsOfPage', args: [m.address, n - count, count] });
    for (const vault of list) {
      const v = { address: vault, abi: vaultAbi, blockNumber } as const;
      const [owner, drill, expiresAt] = await Promise.all([
        client.readContract({ ...v, functionName: 'owner' }),
        client.readContract({ ...v, functionName: 'drill' }),
        client.readContract({ ...v, functionName: 'expiresAt' }),
      ]);
      if (drill && sameAddress(owner, m.address) && (!best || expiresAt > best.expiresAt)) best = { vault, expiresAt };
    }
  }
  return best;
}

export async function runDailyCheck(input: DailyCheckInput): Promise<DailyReport> {
  const { client, deployment: d } = input;
  const symbol = d.chainId === 196 ? 'OKB' : 'ETH';
  const rows: CheckRow[] = [];
  const report: DailyReport = {
    chainId: d.chainId,
    blockNumber: null,
    blockTimestamp: null,
    rows,
    attention: false,
    counters: null,
    keeper: null,
    drill: null,
    site: null,
  };
  const add = (check: string, status: CheckStatus, detail: string) => rows.push({ check, status, detail });

  let head: { number: bigint; timestamp: bigint } | null = null;
  try {
    const b = await client.getBlock({ blockTag: 'latest' });
    head = { number: b.number, timestamp: b.timestamp };
    report.blockNumber = b.number;
    report.blockTimestamp = b.timestamp;
  } catch (e) {
    add('chain', 'attention', `no answer from the RPC: ${why(e)}`);
  }

  if (head) {
    const at = head;
    try {
      const c = await readCounters(createReadContext(d, client), {
        team: input.team.map((m) => m.address),
        blockNumber: at.number,
      });
      report.counters = c;
      add('counters', 'ok', countersDetail(c));
    } catch (e) {
      add('counters', 'attention', `could not read: ${why(e)}`);
    }

    const keeper = input.keeper ?? null;
    if (!keeper) {
      add('keeper', 'skipped', 'no keeper address: pass --keeper or set ATROPYLE_KEEPER');
    } else {
      report.keeper = { address: keeper, balance: null, last: null, sent: null };
      try {
        const balance = await client.getBalance({ address: keeper, blockNumber: at.number });
        report.keeper.balance = balance;
        const text = `${keeper} holds ${formatUnits(balance, 18)} ${symbol}`;
        if (balance < MIN_KEEPER_BALANCE)
          add('keeper balance', 'attention', `${text}, under 0.01 ${symbol}: top it up`);
        else add('keeper balance', 'ok', text);
      } catch (e) {
        add('keeper balance', 'attention', `could not read: ${why(e)}`);
      }
      const blocks = input.keeperBlocks ?? DEFAULT_KEEPER_BLOCKS;
      try {
        const { sent, last } = await lastKeeperTx(client, keeper, at.number, blocks);
        report.keeper.sent = sent;
        report.keeper.last = last;
        const range = `the last ${blocks} blocks`;
        if (!last) {
          add('keeper last tx', 'ok', `no transaction in ${range}`);
        } else {
          const age = formatDuration(at.timestamp - last.timestamp);
          const what = last.action === 'other' ? 'a transaction that is neither poke nor distribute' : last.action;
          add(
            'keeper last tx',
            'ok',
            `${what} to ${last.to ?? '(contract creation)'} at block ${last.blockNumber}, ${age} ago (${last.hash}); ${sent} sent in ${range}`,
          );
        }
      } catch (e) {
        add('keeper last tx', 'attention', `could not read: ${why(e)}`);
      }
    }

    try {
      let drill: { vault: Address; expiresAt: bigint } | null = null;
      if (input.drill) {
        const vault = input.drill;
        const f = { address: d.factory, abi: factoryAbi, blockNumber: at.number } as const;
        if (!(await client.readContract({ ...f, functionName: 'isVault', args: [vault] }))) {
          add('drill', 'attention', `${vault} is not a vault of the factory ${d.factory}`);
        } else {
          const v = { address: vault, abi: vaultAbi, blockNumber: at.number } as const;
          const [isDrill, expiresAt] = await Promise.all([
            client.readContract({ ...v, functionName: 'drill' }),
            client.readContract({ ...v, functionName: 'expiresAt' }),
          ]);
          if (isDrill) drill = { vault, expiresAt };
          else add('drill', 'attention', `${vault} is a paid vault, not a Drill`);
        }
      } else {
        drill = await findDrill(client, d, input.team, at.number);
        if (!drill) add('drill', 'attention', 'no Drill owned by a team address: create one or pass --drill');
      }
      if (drill) {
        const left = drill.expiresAt - at.timestamp;
        report.drill = { ...drill, secondsLeft: left };
        const when = formatUtc(drill.expiresAt);
        if (left <= 0n) add('drill', 'attention', `${drill.vault} expired ${formatDuration(-left)} ago (${when})`);
        else if (left < DRILL_WARN_SECONDS) {
          add('drill', 'attention', `${drill.vault} expires in ${formatDuration(left)} (${when}): create a new one`);
        } else add('drill', 'ok', `${drill.vault} expires in ${formatDuration(left)} (${when})`);
      }
    } catch (e) {
      add('drill', 'attention', `could not read: ${why(e)}`);
    }
  }

  const url = input.siteUrl ?? null;
  if (!url) {
    add('site', 'skipped', 'no site URL: the deployment has no webUrl, pass --site');
  } else {
    report.site = { url, status: null, finalUrl: null };
    try {
      const p = await probeSite(url, input.fetch ?? fetch);
      report.site = { url, status: p.status, finalUrl: p.finalUrl };
      add('site', p.ok ? 'ok' : 'attention', p.detail);
    } catch (e) {
      add('site', 'attention', `${url} did not answer: ${fetchFailure(e)}`);
    }
  }

  report.attention = rows.some((r) => r.status === 'attention');
  return report;
}

export function renderReport(r: DailyReport, chainName: string): string {
  const head =
    r.blockNumber === null || r.blockTimestamp === null
      ? `Atropyle daily check, ${chainName} (chain ${r.chainId}): no block read`
      : `Atropyle daily check, ${chainName} (chain ${r.chainId}), block ${r.blockNumber}, ${formatUtc(r.blockTimestamp)}`;
  const table = [{ check: 'CHECK', status: 'STATUS', detail: 'DETAIL' }, ...r.rows];
  const w1 = Math.max(...table.map((x) => x.check.length));
  const w2 = Math.max(...table.map((x) => x.status.length));
  const lines = table.map((x) => `${x.check.padEnd(w1)}  ${x.status.padEnd(w2)}  ${x.detail}`);
  const verdict = r.attention
    ? `${r.rows.filter((x) => x.status === 'attention').length} check(s) need attention.`
    : 'Nothing needs attention.';
  return [head, '', ...lines, '', verdict, ''].join('\n');
}
