import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  hexToBigInt,
  type PublicClient,
  toHex,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { SHARE } from '../../../apps/web/src/config/share';
import { factoryAbi, vaultAbi } from '../../../packages/sdk/src/abi/index';
import { chainOf } from '../../../packages/sdk/src/chain';
import { getDeployment, getTeam } from '../../../packages/sdk/src/deployments/index';
import { STATE_CODES } from '../../../packages/sdk/src/types';
import {
  APP_TITLE,
  type DailyCheckInput,
  lastKeeperTx,
  probeSite,
  renderReport,
  runDailyCheck,
} from '../../lib/daily-check';

const d = getDeployment('xlayer');
const team = getTeam('xlayer');
const DEPLOYER = team.find((m) => m.role === 'deployer')?.address as Address;
const HEAD = 1_000_000n;
const NOW = 1_795_594_505n;
const KEEPER = getAddress('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
const DRILL = getAddress('0x481f28748959036b48bc6779797228d74f15f4b9');
const OLD_DRILL = getAddress('0x00000000000000000000000000000000000000d1');
const PAID = getAddress('0x00000000000000000000000000000000000000a1');
const POKE = encodeFunctionData({ abi: vaultAbi, functionName: 'poke' });
const DISTRIBUTE = encodeFunctionData({ abi: vaultAbi, functionName: 'distribute' });

interface Tx {
  block: bigint;
  input: Hex;
  to: Address;
}
interface Vault {
  owner: Address;
  drill: boolean;
  expiresAt: bigint;
}
interface World {
  down?: boolean;
  balance?: bigint;
  /** The keeper's transactions, oldest first: transaction i has nonce i. */
  keeperTxs?: Tx[];
  vaults?: Record<string, Vault>;
  index?: Record<string, Address[]>;
}

const block = (b: string | bigint) => (typeof b === 'bigint' ? b : b === 'latest' ? HEAD : hexToBigInt(b as Hex));

/** A node for the X Layer deployment that answers from `w`; it counts the keeper nonce reads. */
function node(w: World) {
  const calls = { keeperNonce: 0, methods: [] as string[] };
  const txs = w.keeperTxs ?? [];
  const vaults = w.vaults ?? {};
  const nonceAt = (b: bigint) => txs.filter((t) => t.block <= b).length;
  const request = async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
    calls.methods.push(method);
    if (w.down) throw new Error('connection refused');
    if (method === 'eth_getBlockByNumber') {
      const n = block(params[0] as string);
      const full = params[1] === true;
      const mine = txs.map((t, nonce) => ({ ...t, nonce })).filter((t) => t.block === n);
      return {
        number: toHex(n),
        hash: `0x${n.toString(16).padStart(64, '0')}`,
        timestamp: toHex(NOW - (HEAD - n)),
        transactions: full
          ? mine.map((t) => ({
              hash: `0x${(t.nonce + 1).toString(16).padStart(64, 'e')}`,
              from: KEEPER.toLowerCase(),
              to: t.to.toLowerCase(),
              input: t.input,
              nonce: toHex(t.nonce),
              blockNumber: toHex(n),
              blockHash: `0x${n.toString(16).padStart(64, '0')}`,
              transactionIndex: '0x0',
              value: '0x0',
              gas: '0x30000',
              gasPrice: '0x1',
              type: '0x0',
            }))
          : [],
      };
    }
    if (method === 'eth_getTransactionCount') {
      const [address, at] = params as [Address, string];
      if (getAddress(address) === d.factory) return toHex(Object.keys(vaults).length + 1);
      if (getAddress(address) !== KEEPER) throw new Error(`nonce of ${address}`);
      calls.keeperNonce++;
      return toHex(nonceAt(block(at)));
    }
    if (method === 'eth_getBalance') return toHex(w.balance ?? 0n);
    if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
    const [{ to, data }] = params as [{ to: Address; data: Hex }];
    const target = getAddress(to);
    if (target === d.factory) {
      const call = decodeFunctionData({ abi: factoryAbi, data });
      const args = (call.args ?? []) as readonly unknown[];
      const list = (a: unknown) => w.index?.[getAddress(a as Address)] ?? [];
      const results: Record<string, () => unknown> = {
        paidCount: () => BigInt(Object.values(vaults).filter((v) => !v.drill).length),
        vaultsOfLength: () => BigInt(list(args[0]).length),
        vaultsOfPage: () => list(args[0]).slice(Number(args[1]), Number(args[1]) + Number(args[2])),
        isVault: () => getAddress(args[0] as Address) in vaults,
      };
      const result = results[call.functionName]?.();
      if (result === undefined) throw new Error(`unexpected factory.${call.functionName}`);
      return encodeFunctionResult({ abi: factoryAbi, functionName: call.functionName, result } as never);
    }
    const v = vaults[target];
    if (!v) throw new Error(`no contract at ${target}`);
    const call = decodeFunctionData({ abi: vaultAbi, data });
    const values: Record<string, unknown> = {
      owner: v.owner,
      drill: v.drill,
      expiresAt: v.expiresAt,
      state: STATE_CODES.active,
      assets: [],
      coverage: [],
    };
    if (!(call.functionName in values)) throw new Error(`unexpected vault.${call.functionName}`);
    return encodeFunctionResult({
      abi: vaultAbi,
      functionName: call.functionName,
      result: values[call.functionName],
    } as never);
  };
  const client = createPublicClient({
    chain: chainOf(d),
    cacheTime: 0,
    transport: custom({ request } as never, { retryCount: 0 }),
  }) as PublicClient;
  return { client, calls };
}

const DAYS = 86_400n;
const healthy: World = {
  balance: 5n * 10n ** 17n,
  keeperTxs: [
    { block: HEAD - 5_000n, input: POKE, to: DRILL },
    { block: HEAD - 3_000n, input: `${DISTRIBUTE}0123`, to: DRILL },
    { block: HEAD - 1_000n, input: '0x', to: DEPLOYER },
  ],
  vaults: {
    [OLD_DRILL]: { owner: DEPLOYER, drill: true, expiresAt: NOW - DAYS },
    [DRILL]: { owner: DEPLOYER, drill: true, expiresAt: NOW + 3n * DAYS },
  },
  index: { [DEPLOYER]: [OLD_DRILL, DRILL] },
};

/** A page whose title is the bare name. */
const APP_PAGE = '<!doctype html><html><head><title>Atropyle</title></head><body><div id="app"></div></body></html>';
/** A parked domain: 200, but some other page. */
const PARKED_PAGE = '<!doctype html><html><head><title></title></head><body>This domain is parked.</body></html>';

type Answer = { status: number; location?: string; body?: string };

/** A fetch that answers each URL from `pages`; any other URL is a 404. It never follows a redirect itself. */
function sites(pages: Record<string, Answer>) {
  const asked: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    const a = pages[url] ?? { status: 404 };
    const headers = a.location ? { location: a.location } : undefined;
    return new Response(a.body ?? null, { status: a.status, headers });
  }) as unknown as typeof fetch;
  return { fetchFn, asked };
}

function site(status: number) {
  return sites({ 'https://atropyle.xyz/': { status, body: status === 200 ? APP_PAGE : 'error' } });
}

function input(w: World, over: Partial<DailyCheckInput> = {}) {
  const { client, calls } = node(w);
  const s = site(200);
  return {
    calls,
    asked: s.asked,
    input: {
      client,
      deployment: d,
      team,
      keeper: KEEPER,
      siteUrl: 'https://atropyle.xyz/',
      fetch: s.fetchFn,
      ...over,
    } satisfies DailyCheckInput,
  };
}

const statusOf = (r: { rows: { check: string; status: string }[] }) =>
  Object.fromEntries(r.rows.map((x) => [x.check, x.status]));

describe('runDailyCheck', () => {
  it('reports a healthy deployment, a table and no attention', async () => {
    const { input: i, asked } = input(healthy);
    const r = await runDailyCheck(i);
    expect(statusOf(r)).toEqual({
      counters: 'ok',
      'keeper balance': 'ok',
      'keeper last tx': 'ok',
      drill: 'ok',
      site: 'ok',
    });
    expect(r.attention).toBe(false);
    expect(r.blockNumber).toBe(HEAD);
    expect(r.counters).toMatchObject({ vaults: { all: 2, outsideTeam: 0 }, paid: { all: 0 } });
    // The newest transaction is a plain transfer: the newest poke or distribute before it is reported.
    expect(r.keeper?.last).toMatchObject({ action: 'distribute', blockNumber: HEAD - 3_000n, to: DRILL });
    expect(r.keeper?.sent).toBe(3);
    // The longest-lived team Drill is the public one; the expired one is ignored.
    expect(r.drill).toEqual({ vault: DRILL, expiresAt: NOW + 3n * DAYS, secondsLeft: 3n * DAYS });
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe('https://atropyle.xyz/');
    // Redirects are followed by hand, so one to another host is never fetched.
    expect(asked[0].init).toMatchObject({ redirect: 'manual' });
    expect(r.site).toEqual({ url: 'https://atropyle.xyz/', status: 200, finalUrl: 'https://atropyle.xyz/' });

    const text = renderReport(r, d.name);
    expect(text).toContain('Atropyle daily check, xlayer (chain 196), block 1000000, 2026-11-25 08:15 UTC');
    expect(text).toMatch(/^CHECK +STATUS +DETAIL$/m);
    expect(text).toMatch(/^keeper balance +ok +0x70997970C51812dc3A010C7d01b50e0d17dc79C8 holds 0.5 OKB$/m);
    expect(text).toContain(`distribute to ${DRILL} at block 997000, 50m ago`);
    expect(text).toContain('3 sent in the last 86400 blocks');
    expect(text).toContain(`${DRILL} expires in 3d (2026-11-28 08:15 UTC)`);
    expect(text).toContain('Nothing needs attention.');
  });

  it('needs attention for a low keeper balance, a Drill expiring within a day and a site that does not answer 200', async () => {
    const w: World = {
      ...healthy,
      balance: 10n ** 16n - 1n,
      vaults: { [DRILL]: { owner: DEPLOYER, drill: true, expiresAt: NOW + 3n * 3600n } },
      index: { [DEPLOYER]: [DRILL] },
    };
    const { client } = node(w);
    const r = await runDailyCheck({ ...input(w).input, client, fetch: site(503).fetchFn });
    expect(statusOf(r)).toMatchObject({ 'keeper balance': 'attention', drill: 'attention', site: 'attention' });
    expect(r.attention).toBe(true);
    const text = renderReport(r, d.name);
    expect(text).toContain('under 0.01 OKB: top it up');
    expect(text).toContain('expires in 3h');
    expect(text).toContain('answered HTTP 503');
    expect(text).toContain('3 check(s) need attention.');
  });

  it('needs attention when the domain forwards to a parked page on another host', async () => {
    // What http://atropyle.xyz/ answered on 25 Nov 2026: a 302 to www, where a parking page answers 200.
    const parked = sites({
      'http://atropyle.xyz/': { status: 302, location: 'http://www.atropyle.xyz/' },
      'http://www.atropyle.xyz/': { status: 200, body: PARKED_PAGE },
    });
    const r = await runDailyCheck(input(healthy, { siteUrl: 'http://atropyle.xyz/', fetch: parked.fetchFn }).input);
    expect(r.rows.find((x) => x.check === 'site')).toEqual({
      check: 'site',
      status: 'attention',
      detail:
        'http://atropyle.xyz/ redirects to http://www.atropyle.xyz/, another host (a forwarder or a parked domain?): point the DNS at the site, or pass --site http://www.atropyle.xyz/ if that host is the site',
    });
    expect(r.attention).toBe(true);
    expect(r.site).toEqual({ url: 'http://atropyle.xyz/', status: 302, finalUrl: 'http://atropyle.xyz/' });
    expect(parked.asked.map((a) => a.url)).toEqual(['http://atropyle.xyz/']);
  });

  it('needs attention when the Drill expired, none is found, or the site fetch throws', async () => {
    const expired: World = { ...healthy, index: { [DEPLOYER]: [OLD_DRILL] } };
    const failing = (async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    }) as unknown as typeof fetch;
    const r = await runDailyCheck({ ...input(expired).input, fetch: failing });
    expect(r.rows.find((x) => x.check === 'drill')).toMatchObject({ status: 'attention' });
    expect(r.rows.find((x) => x.check === 'drill')?.detail).toContain('expired 1d ago');
    expect(r.rows.find((x) => x.check === 'site')?.detail).toBe(
      'https://atropyle.xyz/ did not answer: fetch failed (UND_ERR_CONNECT_TIMEOUT)',
    );

    const none = await runDailyCheck(input({ ...healthy, index: {} }).input);
    expect(none.rows.find((x) => x.check === 'drill')).toEqual({
      check: 'drill',
      status: 'attention',
      detail: 'no Drill owned by a team address: create one or pass --drill',
    });
  });

  it('checks a Drill passed by the maintainer, and refuses an address that is not a Drill of the factory', async () => {
    const w: World = {
      ...healthy,
      vaults: { ...healthy.vaults, [PAID]: { owner: KEEPER, drill: false, expiresAt: 0n } },
    };
    const named = await runDailyCheck(input(w, { drill: OLD_DRILL }).input);
    expect(named.drill?.vault).toBe(OLD_DRILL);
    expect(statusOf(named).drill).toBe('attention');
    const paid = await runDailyCheck(input(w, { drill: PAID }).input);
    expect(paid.rows.find((x) => x.check === 'drill')?.detail).toContain('is a paid vault, not a Drill');
    const stranger = await runDailyCheck(input(w, { drill: KEEPER }).input);
    expect(stranger.rows.find((x) => x.check === 'drill')?.detail).toContain('is not a vault of the factory');
  });

  it('skips the keeper and the site when it has no address or URL, without asking for them', async () => {
    const { input: i, calls, asked } = input(healthy, { keeper: null, siteUrl: null });
    const r = await runDailyCheck(i);
    expect(statusOf(r)).toMatchObject({ keeper: 'skipped', site: 'skipped', counters: 'ok', drill: 'ok' });
    expect(r.attention).toBe(false);
    expect(calls.methods).not.toContain('eth_getBalance');
    expect(asked).toEqual([]);
  });

  it('needs attention when the RPC is down, and still checks the site', async () => {
    const { input: i, asked } = input({ down: true });
    const r = await runDailyCheck(i);
    expect(r.rows[0]).toMatchObject({ check: 'chain', status: 'attention' });
    expect(statusOf(r).site).toBe('ok');
    expect(asked).toHaveLength(1);
    expect(r.attention).toBe(true);
    expect(renderReport(r, d.name)).toContain('no block read');
  });

  it('never calls a method that sends or signs', async () => {
    const { input: i, calls } = input(healthy);
    await runDailyCheck(i);
    const allowed = ['eth_getBlockByNumber', 'eth_getTransactionCount', 'eth_getBalance', 'eth_call', 'eth_chainId'];
    expect(calls.methods.filter((m) => !allowed.includes(m))).toEqual([]);
  });
});

describe('lastKeeperTx', () => {
  it('finds the block of the newest transaction by bisecting the nonce, in a few dozen reads', async () => {
    const { client, calls } = node({ keeperTxs: [{ block: HEAD - 12_345n, input: POKE, to: DRILL }] });
    const r = await lastKeeperTx(client, KEEPER, HEAD, 86_400n);
    expect(r).toMatchObject({ sent: 1, last: { action: 'poke', blockNumber: HEAD - 12_345n, to: DRILL } });
    expect(calls.keeperNonce).toBeLessThanOrEqual(2 + 17);
  });

  it('says nothing was sent in the range, even when older transactions exist', async () => {
    const { client } = node({ keeperTxs: [{ block: HEAD - 90_000n, input: POKE, to: DRILL }] });
    expect(await lastKeeperTx(client, KEEPER, HEAD, 86_400n)).toEqual({ sent: 0, last: null });
  });

  it('returns the newest transaction when none of the last ones is a poke or distribute', async () => {
    const txs = Array.from({ length: 7 }, (_, i) => ({
      block: HEAD - 100n + BigInt(i),
      input: '0x' as Hex,
      to: DEPLOYER,
    }));
    const { client } = node({ keeperTxs: txs });
    const r = await lastKeeperTx(client, KEEPER, HEAD, 1_000n);
    expect(r).toMatchObject({ sent: 7, last: { action: 'other', blockNumber: HEAD - 94n } });
  });
});

describe('probeSite', () => {
  it('follows redirects on its own host, http to https included, and wants the app page', async () => {
    const s = sites({
      'http://atropyle.xyz/': { status: 308, location: 'https://atropyle.xyz/' },
      'https://atropyle.xyz/': { status: 307, location: '/en/' },
      'https://atropyle.xyz/en/': { status: 200, body: APP_PAGE },
    });
    const p = await probeSite('http://atropyle.xyz/', s.fetchFn);
    expect(p).toMatchObject({ ok: true, status: 200, finalUrl: 'https://atropyle.xyz/en/' });
    expect(p.detail).toMatch(/^http:\/\/atropyle\.xyz\/ answered 200 \(via https:\/\/atropyle\.xyz\/en\/\) in \d+ ms$/);
    expect(s.asked.map((a) => a.url)).toEqual([
      'http://atropyle.xyz/',
      'https://atropyle.xyz/',
      'https://atropyle.xyz/en/',
    ]);
    expect(s.asked.every((a) => a.init?.redirect === 'manual')).toBe(true);
  });

  it('needs attention for a 200 that is not the app, as a masked forwarder or a parking page serves', async () => {
    const s = sites({ 'https://atropyle.xyz/': { status: 200, body: PARKED_PAGE } });
    const p = await probeSite('https://atropyle.xyz/', s.fetchFn);
    expect(p).toMatchObject({ ok: false, status: 200 });
    expect(p.detail).toBe(
      'https://atropyle.xyz/ answered 200 but not with the Atropyle app (no <title> starting with Atropyle): a parked or forwarded domain?',
    );
  });

  it('needs attention for a redirect off HTTPS, without a Location, or in a loop', async () => {
    const down = sites({ 'https://atropyle.xyz/': { status: 301, location: 'http://atropyle.xyz/' } });
    expect((await probeSite('https://atropyle.xyz/', down.fetchFn)).detail).toBe(
      'https://atropyle.xyz/ redirects to http://atropyle.xyz/, off HTTPS',
    );
    const bare = sites({ 'https://atropyle.xyz/': { status: 302 } });
    expect((await probeSite('https://atropyle.xyz/', bare.fetchFn)).detail).toBe(
      'https://atropyle.xyz/ answered HTTP 302 with no Location',
    );
    const loop = sites({
      'https://atropyle.xyz/': { status: 302, location: '/a' },
      'https://atropyle.xyz/a': { status: 302, location: '/' },
    });
    const p = await probeSite('https://atropyle.xyz/', loop.fetchFn);
    expect(p).toMatchObject({ ok: false, detail: 'https://atropyle.xyz/ redirects more than 5 times' });
    expect(loop.asked).toHaveLength(6);
  });

  it('knows the title of the web app, and not a parked domain named after the site', () => {
    // The home page of the production site: its <title> is SHARE.title (apps/web/src/app/layout.tsx).
    expect(APP_TITLE.test(`<title>${SHARE.title}</title>`)).toBe(true);
    expect(APP_TITLE.test('<title>Atropyle</title>')).toBe(true);
    expect(APP_TITLE.test('<title>Atropyle: inheritance and wallet recovery on X Layer</title>')).toBe(true);
    expect(APP_TITLE.test('<title></title>')).toBe(false);
    expect(APP_TITLE.test('<title>atropyle.xyz</title>')).toBe(false);
    expect(APP_TITLE.test('<title>Atropyle.xyz is for sale</title>')).toBe(false);
  });
});
