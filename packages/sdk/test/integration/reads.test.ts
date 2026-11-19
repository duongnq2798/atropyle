import {
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  InvalidInputRpcError,
  keccak256,
  RpcRequestError,
  type Transport,
  toHex,
} from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS, rpc } from '../../../../scripts/lib/anvil';
import { vaultAbi } from '../../src/abi/index';
import { createAtropyle, PRESETS, predictAction, type VaultParams } from '../../src/index';
import { createVaultRaw, devnet, revertChain, sendRaw, snapshotChain, warp } from './helpers';

const [, OWNER, HEIR, G1, G2, HEIR2, , , STRANGER] = ANVIL_ACCOUNTS;

interface Seen {
  method: string;
  params: unknown[];
}

/** An http transport that records every JSON-RPC request; `before` runs ahead of each one and may move the chain. */
function spy(url: string, before?: (req: Seen) => Promise<void>): { transport: Transport; seen: Seen[] } {
  const seen: Seen[] = [];
  const base = http(url);
  const transport = ((args: Parameters<Transport>[0]) => {
    const t = base(args);
    return {
      ...t,
      request: async (req: { method: string; params?: unknown }) => {
        const entry = { method: req.method, params: (req.params ?? []) as unknown[] };
        seen.push(entry);
        await before?.(entry);
        return t.request(req as never);
      },
    };
  }) as unknown as Transport;
  return { transport, seen };
}

describe('reads on the devnet', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment });
  const usdt0 = env.deployment.feeTokens[0];
  const drill: VaultParams = {
    heirs: [{ account: HEIR, bps: 10000 }],
    guardians: [],
    k: 0,
    recoveryEnabled: false,
    timing: PRESETS.drill,
    assets: [{ kind: 'erc20', token: usdt0, id: 0n, heir: 0 }],
  };
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('reads a fresh Drill vault', async () => {
    const salt = keccak256(toHex('reads-1'));
    const vault = await createVaultRaw(env, { owner: OWNER, params: drill, salt });
    expect(await atro.predictVault(OWNER, salt)).toBe(vault);
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [vault, 500_000_000n] });
    await sendRaw(env, { from: OWNER, to: usdt0, data: approve });
    const s = await atro.vault(vault).snapshot();
    expect(s.config).toEqual({ owner: OWNER, drill: true, ...drill });
    expect(s.status).toMatchObject({
      state: 'active',
      pending: 'active',
      expired: false,
      recoveryTarget: null,
      alarmAt: null,
      idle: 0,
    });
    expect(s.status.expiresAt).toBe(s.status.lastAlive + 7n * 86400n);
    expect(s.status.assets[0]).toMatchObject({
      coverage: 500_000_000n,
      held: 10_000_000_000n,
      token: { decimals: 6, symbol: { untrusted: true, value: 'USDT0' } },
    });
    expect(s.binding).toEqual({ factory: env.deployment.factory, cpu: env.deployment.cpu, policyId: 1n });
  });

  it('maps on-chain zeros to null for a paid vault, so nothing reads as an expired Drill', async () => {
    const params: VaultParams = {
      ...drill,
      guardians: [G1, G2],
      k: 2,
      recoveryEnabled: true,
      timing: PRESETS.sixMonths,
    };
    const approve = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [env.deployment.factory, 1_990_000n],
    });
    await sendRaw(env, { from: OWNER, to: usdt0, data: approve });
    const vault = await createVaultRaw(env, { owner: OWNER, params, drill: false, feeToken: usdt0 });
    const s = await atro.vault(vault).snapshot();
    expect(s.config.drill).toBe(false);
    expect(s.status).toMatchObject({
      expiresAt: null,
      expired: false,
      alarmAt: null,
      windowEndsAt: null,
      releasedAt: null,
      recoveryTarget: null,
      inhVoters: [],
      recVotes: [
        { guardian: G1, target: null },
        { guardian: G2, target: null },
      ],
    });
    const engine = await atro.engine();
    const now = s.status.blockTimestamp;
    expect(predictAction(engine, s, { type: 'checkIn' }, OWNER, now)).toMatchObject({ drillExpired: false });
    // Ten years on a paid vault is still not an expired Drill.
    const later = now + 10n * 365n * 86400n;
    expect(predictAction(engine, s, { type: 'poke' }, G1, later)).toMatchObject({ drillExpired: false });
  });

  it('snapshot pins every read to one block', async () => {
    const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
    const { transport, seen } = spy(env.rpcUrl);
    const s = await createAtropyle({ chain: env.deployment, transport }).vault(vault).snapshot();
    const pinned = seen.filter((x) => x.method === 'eth_call' || x.method === 'eth_getCode');
    expect(pinned.length).toBeGreaterThan(10);
    for (const x of pinned) expect(x.params[1]).toBe(toHex(s.status.blockNumber));
    // One head read; the block that supplies "now" is the same block the contract was read at.
    expect(seen.filter((x) => x.method === 'eth_blockNumber')).toHaveLength(1);
    expect(seen.filter((x) => x.method === 'eth_getBlockByNumber').map((x) => x.params[0])).toEqual([
      toHex(s.status.blockNumber),
    ]);
  });

  it('snapshot stays on its block while the chain moves on', async () => {
    const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
    let moved = false;
    const { transport } = spy(env.rpcUrl, async (req) => {
      // The head has just been read; the chain now jumps 10 minutes ahead, past the alarm of this Drill (P x T = 120 s).
      if (req.method === 'eth_getBlockByNumber' && !moved) {
        moved = true;
        await warp(env.rpcUrl, 600);
      }
    });
    const s = await createAtropyle({ chain: env.deployment, transport }).vault(vault).snapshot();
    const head = await env.publicClient.getBlock();
    const pinned = await env.publicClient.getBlock({ blockNumber: s.status.blockNumber });
    expect(head.number).toBeGreaterThan(s.status.blockNumber);
    expect(s.status.blockTimestamp).toBe(pinned.timestamp);
    expect(head.timestamp - s.status.blockTimestamp).toBeGreaterThanOrEqual(600n);
    expect([s.status.state, s.status.pending]).toEqual(['active', 'active']);
    expect((await atro.vault(vault).status()).pending).toBe('grace');
    expect(await atro.vault(vault).snapshot({ blockNumber: s.status.blockNumber })).toEqual(s);
  });

  it('predicts the timeline and reports a pending transition before anyone pokes', async () => {
    const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
    const h = atro.vault(vault);
    const s0 = await h.status();
    const t = await h.timeline();
    expect(t.engine).toBe('model');
    expect(t.events.map((e) => [e.kind, e.state, e.at - s0.lastAlive])).toEqual([
      ['alarm', 'grace', 120n],
      ['release', 'releasedInherit', 240n],
      // A released Drill still ends: distribute() reverts after expiresAt.
      ['drillExpiry', 'releasedInherit', (s0.expiresAt ?? 0n) - s0.lastAlive],
    ]);
    await warp(env.rpcUrl, 130);
    const s1 = await h.status();
    expect([s1.state, s1.pending]).toEqual(['active', 'grace']);
    await sendRaw(env, { from: G1, to: vault, data: encodeFunctionData({ abi: vaultAbi, functionName: 'poke' }) });
    const s2 = await h.status();
    expect(s2.state).toBe('grace');
    expect(s2.alarmAt).not.toBeNull();
    const names = (await h.events()).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['Alive', 'AlarmRaised', 'StateChanged']));
  });

  it('finds roles from the factory index and the current lists', async () => {
    const params: VaultParams = {
      heirs: [
        { account: HEIR, bps: 7000 },
        { account: HEIR2, bps: 3000 },
      ],
      guardians: [G1, G2, HEIR2],
      k: 2,
      recoveryEnabled: true,
      timing: PRESETS.drill,
      assets: [],
    };
    const vault = await createVaultRaw(env, { owner: OWNER, params });
    expect(await atro.vault(vault).roleOf(HEIR2)).toEqual(['heir', 'guardian']);
    expect(await atro.vault(vault).roleOf(STRANGER)).toEqual([]);
    const mine = (await atro.vaultsOf(HEIR2)).find((v) => v.vault === vault);
    expect(mine).toMatchObject({ owner: OWNER, drill: true, state: 'active', roles: ['heir', 'guardian'] });
    expect((await atro.vaultsOf(OWNER)).find((v) => v.vault === vault)?.roles).toEqual(['owner']);
    const newer = await createVaultRaw(env, { owner: OWNER, params });
    expect((await atro.vaultsOf(OWNER, { limit: 1 })).map((v) => v.vault)).toEqual([newer]);
  });

  it('reads fees and counts stats from events', async () => {
    const fees = await atro.fees();
    expect(fees.earlyRemaining).toBe(100n);
    expect(fees.tokens.map((t) => t.fee)).toEqual([1_990_000n, 1_990_000n, 1_990_000n]);
    expect(fees.tokens[0].symbol.value).toBe('USDT0');
    await createVaultRaw(env, { owner: OWNER, params: drill });
    await createVaultRaw(env, { owner: G1, params: drill });
    const st = await atro.stats();
    expect(st.vaults).toEqual({ total: 2, drill: 2, paid: 0 });
    expect(st.owners).toBe(2);
    expect(st.checkIns).toBe(0);
    const v3 = await createVaultRaw(env, { owner: OWNER, params: drill });
    await sendRaw(env, { from: OWNER, to: v3, data: encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' }) });
    const next = await atro.stats({ resume: st.cursor });
    expect(next.fromBlock).toBe(st.fromBlock);
    expect(next.vaults.total).toBe(3);
    expect(next.owners).toBe(2);
    expect(next.checkIns).toBe(1);
    expect(next).toEqual({ ...(await atro.stats()), cursor: expect.anything() });
  });

  it('clamps every eth_getLogs range to the deployment limit', async () => {
    const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
    const { transport, seen } = spy(env.rpcUrl);
    const small = createAtropyle({ chain: { ...env.deployment, logsBlockRange: 3 }, transport });
    const events = await small.vault(vault).events();
    const stats = await small.stats();
    const calls = seen.filter((x) => x.method === 'eth_getLogs');
    expect(calls.length).toBeGreaterThan(10);
    for (const c of calls) {
      const { fromBlock, toBlock } = c.params[0] as { fromBlock: Hex; toBlock: Hex };
      expect(BigInt(toBlock) - BigInt(fromBlock) + 1n).toBeLessThanOrEqual(3n);
    }
    expect(events).toEqual(await atro.vault(vault).events());
    expect(events.map((e) => e.blockNumber)).toEqual(events.map((e) => e.blockNumber).sort((a, b) => Number(a - b)));
    expect(stats).toEqual(await atro.stats());
  });

  it('never moves the stats cursor back, so a lagging head cannot double count', async () => {
    await createVaultRaw(env, { owner: OWNER, params: drill });
    await createVaultRaw(env, { owner: G1, params: drill });
    const st = await atro.stats();
    // A node behind the cursor (or an explicit older toBlock): nothing new to read, the cursor stays where it was.
    const behind = await atro.stats({ resume: st.cursor, toBlock: st.cursor.toBlock - 1n });
    expect(behind).toEqual(st);
    const v3 = await createVaultRaw(env, { owner: OWNER, params: drill });
    await sendRaw(env, { from: OWNER, to: v3, data: encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' }) });
    const resumed = await atro.stats({ resume: behind.cursor });
    expect(resumed.vaults.total).toBe(3);
    expect(resumed.checkIns).toBe(1);
    expect(resumed).toEqual(await atro.stats());
  });

  describe('a node that has not reached the block', () => {
    const stale = () =>
      new InvalidInputRpcError(
        new RpcRequestError({
          body: { method: 'eth_call' },
          error: { code: -32000, message: 'header not found' },
          url: env.rpcUrl,
        }),
      );
    const decimalsCall = encodeFunctionData({ abi: erc20Abi, functionName: 'decimals' });
    const balanceCall = encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [OWNER] });
    const callOf = (req: Seen) => req.params[0] as { to: string; data: Hex };

    /** A client whose eth_calls matching `broken` fail with `failure` until `heal()` is called. */
    function lagging(broken: (call: { to: string; data: Hex }) => boolean, failure: () => Error = stale) {
      let healthy = false;
      const { transport } = spy(env.rpcUrl, async (req) => {
        if (!healthy && req.method === 'eth_call' && broken(callOf(req))) throw failure();
      });
      const heal = () => {
        healthy = true;
      };
      return { atro: createAtropyle({ chain: env.deployment, transport }), heal };
    }

    it('makes the snapshot fail instead of reading the vault as NOT_VAULT', async () => {
      const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
      const { atro: lag, heal } = lagging((c) => c.to.toLowerCase() === vault.toLowerCase());
      await expect(lag.vault(vault).snapshot()).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
      heal();
      expect((await lag.vault(vault).snapshot()).config.owner).toBe(OWNER);
    });

    it('makes the snapshot fail instead of reading the balance as 0', async () => {
      const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
      const { atro: lag, heal } = lagging((c) => c.data === balanceCall);
      await expect(lag.vault(vault).snapshot()).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
      heal();
      expect((await lag.vault(vault).snapshot()).status.assets[0].held).toBe(10_000_000_000n);
    });

    it('treats a backend error (-32603) the same way: viem calls it a revert, the SDK does not', async () => {
      const internal = () =>
        new RpcRequestError({
          body: { method: 'eth_call' },
          error: { code: -32603, message: 'Internal error' },
          url: env.rpcUrl,
        });
      const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
      for (const broken of [
        (c: { to: string; data: Hex }) => c.data === decimalsCall,
        (c: { to: string; data: Hex }) => c.data === balanceCall,
        (c: { to: string; data: Hex }) => c.to.toLowerCase() === vault.toLowerCase(),
      ]) {
        const { atro: lag, heal } = lagging(broken, internal);
        await expect(lag.vault(vault).snapshot()).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
        heal();
        const s = await lag.vault(vault).snapshot();
        expect(s.status.assets[0]).toMatchObject({ held: 10_000_000_000n, token: { decimals: 6 } });
      }
    });

    it('makes the snapshot fail instead of caching a token without decimals', async () => {
      const vault = await createVaultRaw(env, { owner: OWNER, params: drill });
      const { atro: lag, heal } = lagging((c) => c.data === decimalsCall);
      await expect(lag.vault(vault).snapshot()).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
      heal();
      // The same client, once the node has caught up: the failed read was not cached.
      expect((await lag.vault(vault).snapshot()).status.assets[0].token).toMatchObject({
        decimals: 6,
        symbol: { value: 'USDT0' },
      });
    });
  });

  it('reads a token whose name() and symbol() are a bytes32 as empty text instead of failing the snapshot', async () => {
    // MKR and the old DAI return a bytes32 for name() and symbol(), which viem cannot decode as a string. This stand-in
    // answers every call with that one word: PUSH32 word, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0, RETURN.
    const mkr = '0x0000000000000000000000000000000000004d4B' as const;
    const word = Buffer.from('MKR').toString('hex').padEnd(64, '0');
    await rpc(env.rpcUrl, 'anvil_setCode', [mkr, `0x7f${word}60005260206000f3`]);
    const params: VaultParams = { ...drill, assets: [{ kind: 'erc20', token: mkr, id: 0n, heir: 0 }] };
    const vault = await createVaultRaw(env, { owner: OWNER, params });
    const [a] = (await atro.vault(vault).status()).assets;
    expect(a.token).toMatchObject({ decimals: null, symbol: { value: '' }, name: { value: '' } });
  });

  it('reads real reverts of a token as its answer: no decimals, no symbol, balance 0', async () => {
    const { nft, multi } = env.deployment.mocks ?? { nft: usdt0, multi: usdt0 };
    const params: VaultParams = {
      ...drill,
      assets: [
        // An ERC-721 contract has name and symbol but no decimals().
        { kind: 'erc20', token: nft, id: 0n, heir: 0 },
        // An ERC-1155 contract has none of name, symbol, decimals or an ERC-20 balanceOf.
        { kind: 'erc20', token: multi, id: 0n, heir: 0 },
      ],
    };
    const vault = await createVaultRaw(env, { owner: OWNER, params });
    const [a, b] = (await atro.vault(vault).status()).assets;
    expect(a.token).toMatchObject({ decimals: null, symbol: { value: 'MNFT' } });
    expect(b.token).toMatchObject({ decimals: null, symbol: { value: '' }, name: { value: '' } });
    expect(b.held).toBe(0n);
  });

  it('rejects addresses that are not vaults', async () => {
    await expect(atro.vault(STRANGER).snapshot()).rejects.toMatchObject({ code: 'NOT_VAULT' });
    await expect(atro.vault(usdt0).snapshot()).rejects.toMatchObject({ code: 'NOT_VAULT' });
  });
});
