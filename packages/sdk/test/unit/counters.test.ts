import {
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  defineChain,
  encodeFunctionResult,
  erc20Abi,
  getAddress,
  type Hex,
  HttpRequestError,
  type PublicClient,
  toHex,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { factoryAbi, vaultAbi } from '../../src/abi/index';
import { createAtropyle } from '../../src/client';
import { getDeployment, getTeam } from '../../src/deployments/index';
import { stringify } from '../../src/json';
import { createReadContext } from '../../src/read/context';
import { readCounters } from '../../src/read/counters';
import { STATE_CODES } from '../../src/types';

const BLOCK = 1_000n;
const TIME = 1_795_594_505n;
const TEAM = getAddress('0xc0a61674fa1caad04500073ea94ec9006d7a2375');
const TREASURY = getAddress('0x990221559b7eb3516204dc73535d6581391cfaa4');
const ALICE = getAddress('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
const BOB = getAddress('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc');
const USD6 = getAddress('0x779ded0c9e1022225f8e0630b35a9b54be713736');
const USD18 = getAddress('0xb6ceceab302e2e4948951ee7843fc24e92933061');
const OTHER_TOKEN = getAddress('0x5fbdb2315678afecb367f032d93f642f64180aa3');
const NFT = getAddress('0xe7f1725e7734ce288f8367e1bb143e90bb3f0512');
const v = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, '0')}`);

const deployment = { ...getDeployment('local'), feeTokens: [USD6, USD18] };

interface Asset {
  kind: number;
  token: Address;
  id: bigint;
  heir: number;
}
interface VaultModel {
  owner: Address;
  drill?: boolean;
  state?: number;
  assets?: Asset[];
  coverage?: bigint[];
}
interface World {
  nonce: number;
  paid: bigint;
  index?: Record<string, Address[]>;
  vaults: Record<string, VaultModel>;
  /** The factory this node answers for (the devnet deployment's by default). */
  factory?: Address;
}

const erc20 = (token: Address): Asset => ({ kind: 0, token, id: 0n, heir: 0 });
const DECIMALS: Record<string, number> = { [USD6]: 6, [USD18]: 18, [OTHER_TOKEN]: 6 };

interface Seen {
  method: string;
  fn?: string;
  block?: string;
}

/** A node that knows one block: every state read must name it, or the test fails. */
function node(w: World, seen: Seen[] = [], fail?: (method: string) => unknown) {
  const at = toHex(BLOCK);
  const factory = w.factory ?? deployment.factory;
  const answer = (method: string, params: unknown[]): unknown => {
    const failure = fail?.(method);
    if (failure) throw failure;
    if (method === 'eth_getBlockByNumber') {
      seen.push({ method, block: params[0] as string });
      return { number: at, timestamp: toHex(TIME), hash: `0x${'ab'.repeat(32)}`, transactions: [] };
    }
    if (method === 'eth_getTransactionCount') {
      const [address, block] = params as [Address, string];
      seen.push({ method, block });
      if (getAddress(address) !== factory) throw new Error(`nonce of ${address}`);
      return toHex(w.nonce);
    }
    if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
    const [{ to, data }, block] = params as [{ to: Address; data: Hex }, string];
    const target = getAddress(to);
    if (target === factory) {
      const call = decodeFunctionData({ abi: factoryAbi, data });
      seen.push({ method, fn: call.functionName, block });
      const args = (call.args ?? []) as readonly unknown[];
      const list = (a: unknown) => w.index?.[getAddress(a as Address)] ?? [];
      let result: unknown;
      if (call.functionName === 'paidCount') result = w.paid;
      else if (call.functionName === 'vaultsOfLength') result = BigInt(list(args[0]).length);
      else if (call.functionName === 'vaultsOfPage') {
        const start = Number(args[1]);
        result = list(args[0]).slice(start, start + Number(args[2]));
      } else if (call.functionName === 'isVault') result = getAddress(args[0] as Address) in w.vaults;
      else throw new Error(`unexpected factory.${call.functionName}`);
      return encodeFunctionResult({ abi: factoryAbi, functionName: call.functionName, result } as never);
    }
    if (target in DECIMALS) {
      const call = decodeFunctionData({ abi: erc20Abi, data });
      seen.push({ method, fn: `token.${call.functionName}`, block });
      const result = call.functionName === 'decimals' ? DECIMALS[target] : 'USD';
      return encodeFunctionResult({ abi: erc20Abi, functionName: call.functionName, result } as never);
    }
    const vault = w.vaults[target];
    if (!vault) throw new Error(`no contract at ${target}`);
    const call = decodeFunctionData({ abi: vaultAbi, data });
    seen.push({ method, fn: `vault.${call.functionName}`, block });
    const values: Record<string, unknown> = {
      owner: vault.owner,
      drill: vault.drill ?? false,
      state: vault.state ?? STATE_CODES.active,
      assets: vault.assets ?? [],
      coverage: vault.coverage ?? [],
    };
    if (!(call.functionName in values)) throw new Error(`unexpected vault.${call.functionName}`);
    return encodeFunctionResult({
      abi: vaultAbi,
      functionName: call.functionName,
      result: values[call.functionName],
    } as never);
  };
  return { request: async (a: { method: string; params?: unknown[] }) => answer(a.method, a.params ?? []) };
}

const CHAIN = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:1'] } },
});

function contextOf(w: World, seen: Seen[] = []) {
  const client = createPublicClient({
    chain: CHAIN,
    cacheTime: 0,
    transport: custom(node(w, seen) as never, { retryCount: 0 }),
  }) as PublicClient;
  return createReadContext(deployment, client);
}

describe('readCounters', () => {
  it('counts the mainnet launch state: one team Drill, nothing paid, nothing outside the team', async () => {
    const drill = v(1);
    const seen: Seen[] = [];
    const ctx = contextOf(
      { nonce: 2, paid: 0n, index: { [TEAM]: [drill] }, vaults: { [drill]: { owner: TEAM, drill: true } } },
      seen,
    );
    const c = await readCounters(ctx, { team: [TEAM, TREASURY] });
    expect(c).toMatchObject({
      chainId: deployment.chainId,
      factory: deployment.factory,
      blockNumber: BLOCK,
      blockTimestamp: TIME,
      team: [TEAM, TREASURY],
      vaults: { all: 1, outsideTeam: 0 },
      paid: { all: 0, outsideTeam: 0 },
      releases: { all: 0, outsideTeam: 0 },
      stablecoins: { all: 0n, outsideTeam: 0n, decimals: 6 },
      read: 1,
      complete: true,
      teamComplete: true,
    });
    // One block, read first; every later read is pinned to it.
    expect(seen[0]).toEqual({ method: 'eth_getBlockByNumber', block: 'latest' });
    expect(seen.slice(1).every((s) => s.block === toHex(BLOCK))).toBe(true);
    // A Drill holds no stablecoins: its assets are never read. No eth_getLogs anywhere.
    expect(seen.map((s) => s.fn)).not.toContain('vault.assets');
    expect(seen.map((s) => s.method)).not.toContain('eth_getLogs');
  });

  it('reads extra vaults, ignores addresses the factory did not create, and splits every count by team', async () => {
    const teamPaid = v(1);
    const alicePaid = v(2);
    const bobReleasedDrill = v(3);
    const bobReleasedPaid = v(4);
    const fake = v(99);
    const ctx = contextOf({
      nonce: 5,
      paid: 3n,
      index: { [TEAM]: [teamPaid] },
      vaults: {
        [teamPaid]: { owner: TEAM, assets: [erc20(USD6)], coverage: [2_000_000n] },
        [alicePaid]: {
          owner: ALICE,
          assets: [erc20(USD6), erc20(OTHER_TOKEN), { kind: 1, token: NFT, id: 7n, heir: 0 }],
          coverage: [5_250_000n, 9_000_000n, 1n],
        },
        [bobReleasedDrill]: { owner: BOB, drill: true, state: STATE_CODES.releasedInherit },
        [bobReleasedPaid]: {
          owner: BOB,
          state: STATE_CODES.releasedRecover,
          assets: [erc20(USD6)],
          coverage: [7_000_000n],
        },
      },
    });
    const c = await readCounters(ctx, {
      team: [TEAM],
      vaults: [alicePaid, bobReleasedDrill, bobReleasedPaid, fake, teamPaid.toLowerCase()],
    });
    expect(c.vaults).toEqual({ all: 4, outsideTeam: 3 });
    expect(c.paid).toEqual({ all: 3, outsideTeam: 2 });
    expect(c.releases).toEqual({ all: 2, outsideTeam: 2 });
    // Live paid vaults only, fee tokens only: 2 (team) + 5.25 (Alice); released, Drill, other token and NFT left out.
    expect(c.stablecoins).toEqual({ all: 7_250_000n, outsideTeam: 5_250_000n, decimals: 6 });
    expect(c.read).toBe(4);
    expect(c.complete).toBe(true);
  });

  it('counts one balance once when two vaults of one owner cover it, and scales every token to 6 decimals', async () => {
    const a = v(1);
    const b = v(2);
    const ctx = contextOf({
      nonce: 3,
      paid: 2n,
      vaults: {
        [a]: { owner: ALICE, assets: [erc20(USD6), erc20(USD18)], coverage: [3_000_000n, 10n ** 18n] },
        [b]: { owner: ALICE, assets: [erc20(USD6)], coverage: [4_000_000n] },
      },
    });
    const c = await readCounters(ctx, { team: [TEAM], vaults: [a, b] });
    // max(3, 4) USD6 + 1 USD18 (10^18 at 18 decimals is 1.000000).
    expect(c.stablecoins.all).toBe(5_000_000n);
    expect(c.stablecoins.outsideTeam).toBe(5_000_000n);
  });

  it('says the counts it cannot finish are lower bounds, while vaults and paid stay exact', async () => {
    const teamVault = v(1);
    const ctx = contextOf({
      nonce: 10,
      paid: 6n,
      index: { [TEAM]: [teamVault] },
      vaults: { [teamVault]: { owner: TEAM } },
    });
    const c = await readCounters(ctx, { team: [TEAM] });
    expect(c.vaults).toEqual({ all: 9, outsideTeam: 8 });
    expect(c.paid).toEqual({ all: 6, outsideTeam: 5 });
    expect(c.read).toBe(1);
    expect(c.complete).toBe(false);
    expect(c.teamComplete).toBe(true);
  });

  it('a team address that is only an heir does not make the vault a team vault', async () => {
    const alices = v(1);
    const ctx = contextOf({
      nonce: 2,
      paid: 1n,
      index: { [TEAM]: [alices] },
      vaults: { [alices]: { owner: ALICE, state: STATE_CODES.releasedInherit } },
    });
    const c = await readCounters(ctx, { team: [TEAM] });
    expect(c.vaults).toEqual({ all: 1, outsideTeam: 1 });
    expect(c.paid).toEqual({ all: 1, outsideTeam: 1 });
    expect(c.releases).toEqual({ all: 1, outsideTeam: 1 });
    expect(c.complete).toBe(true);
  });

  it('stops at maxVaults and at 1000 index entries per team address, and says so', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => v(i + 1));
    const vaults = Object.fromEntries(many.map((a) => [a, { owner: ALICE, drill: true }]));
    const capped = await readCounters(contextOf({ nonce: 1002, paid: 0n, index: { [TEAM]: many }, vaults }), {
      team: [TEAM],
      maxVaults: 10,
    });
    expect(capped).toMatchObject({ read: 10, complete: false, teamComplete: false, vaults: { all: 1001 } });

    const seen: Seen[] = [];
    const deep = await readCounters(contextOf({ nonce: 1002, paid: 0n, index: { [TEAM]: many }, vaults }, seen), {
      team: [TEAM],
      maxVaults: 2000,
    });
    expect(deep).toMatchObject({ read: 1000, complete: false, teamComplete: false });
    expect(seen.filter((s) => s.fn === 'vaultsOfPage')).toHaveLength(10);
  });

  it('never reports fewer vaults than it read or than paid, whatever the nonce says', async () => {
    const a = v(1);
    const ctx = contextOf({ nonce: 1, paid: 1n, vaults: { [a]: { owner: ALICE } } });
    const c = await readCounters(ctx, { vaults: [a] });
    expect(c.vaults).toEqual({ all: 1, outsideTeam: 1 });
  });

  it('rejects a bad option before any RPC call', async () => {
    const seen: Seen[] = [];
    const ctx = contextOf({ nonce: 1, paid: 0n, vaults: {} }, seen);
    await expect(readCounters(ctx, { maxVaults: -1 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(readCounters(ctx, { team: ['0x12'] })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    expect(seen).toEqual([]);
  });

  it('serializes bigints as decimal strings', async () => {
    const ctx = contextOf({ nonce: 1, paid: 0n, vaults: {} });
    const json = JSON.parse(stringify(await readCounters(ctx)));
    expect(json).toMatchObject({ blockNumber: '1000', blockTimestamp: String(TIME), stablecoins: { all: '0' } });
  });
});

describe('client.counters', () => {
  it('counts the owners of deployments/team.json as the team by default', async () => {
    const atro = createAtropyle({
      chain: 'xlayer',
      transport: custom(node({ nonce: 1, paid: 0n, vaults: {}, factory: getDeployment('xlayer').factory }) as never, {
        retryCount: 0,
      }),
    });
    const c = await atro.counters();
    expect(c.team).toEqual(getTeam('xlayer').map((m) => m.address));
    expect(c.team).toContain(getDeployment('xlayer').treasury);
  });

  it('leaves as an AtropyleError when the RPC fails', async () => {
    const limited = () => new HttpRequestError({ url: 'https://rpc.example', status: 429 });
    const atro = createAtropyle({
      chain: 'local',
      transport: custom(node({ nonce: 1, paid: 0n, vaults: {} }, [], limited) as never, { retryCount: 0 }),
    });
    await expect(atro.counters()).rejects.toMatchObject({ name: 'AtropyleError', code: 'RPC_RATE_LIMITED' });
  });
});
