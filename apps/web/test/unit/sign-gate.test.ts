import {
  type AtropyleClient,
  AtropyleError,
  appendSuffix,
  assetsToAbi,
  builderCodeSuffix,
  type ConfirmAddress,
  type CreateTerms,
  factoryAbi,
  GUARDIAN_WARNING,
  type InspectedStep,
  type InspectOptions,
  PRESETS,
  paramsToAbi,
  type SignPayload,
  type SignRequestCheck,
  type TokenInfo,
  type TxPlan,
  untrusted,
  vaultAbi,
} from '@atropyle/sdk';
import { type Address, encodeFunctionData, erc20Abi, type Hex, maxUint256, type WalletClient, zeroAddress } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { signAssets, signPlan, signSenderWith, signTokens, typedReason } from '../../src/flows/impl/sign-gate';
import type { Eip1193 } from '../../src/wallet/types';
import { PEOPLE } from './fixtures';

const { owner: A, vault: V, g1, g2, heirA, stranger, token: USD, nft: NFT } = PEOPLE;
const FACTORY: Address = '0x1111111111111111111111111111111111111111';
const CHECK_IN: Hex = '0x183ff085';
const vote = (target: Address) => encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [target] });

function step(over: Partial<InspectedStep> = {}): InspectedStep {
  return {
    index: 0,
    to: V,
    value: 0n,
    action: 'checkIn',
    summary: 'Check in.',
    warnings: [],
    allowed: true,
    reason: null,
    builderCodes: null,
    simulation: { ok: true, gas: 50_000n },
    create: null,
    ...over,
  };
}
function checkOf(steps: InspectedStep[], over: Partial<SignRequestCheck> = {}): SignRequestCheck {
  return { ok: true, chainId: 196, from: A, vault: V, steps, confirm: null, ...over };
}
const payload = (data: Hex[], to: Address[] = data.map(() => V)): SignPayload => ({
  chainId: 196,
  from: A,
  steps: data.map((d, i) => ({ to: to[i], data: d, value: 0n })),
});

const createOf = (assets: Parameters<typeof assetsToAbi>[0]) =>
  encodeFunctionData({
    abi: factoryAbi,
    functionName: 'createVault',
    args: [
      paramsToAbi({
        heirs: [{ account: heirA, bps: 10_000 }],
        guardians: [],
        k: 0,
        recoveryEnabled: false,
        timing: PRESETS.drill,
        assets: [...assets],
      }),
      `0x${'00'.repeat(32)}`,
      true,
      USD,
    ],
  });
const CREATE = createOf([
  { kind: 'erc20', token: USD, id: 0n, heir: 0 },
  { kind: 'erc721', token: NFT, id: 2n, heir: 0 },
]);
const TERMS: CreateTerms = {
  vault: V,
  drill: false,
  heirs: [{ account: heirA, bps: 10_000 }],
  guardians: [],
  k: 0,
  recoveryEnabled: false,
  timing: PRESETS.drill,
  exit: { routes: [], earliest: null, expiresAfter: null },
  readAt: 0n,
  earliestAt: null,
};
const asked: ConfirmAddress[] = [
  { step: 0, vault: V, role: 'heir', index: 0, account: heirA, bps: 10_000 },
  { step: 0, vault: V, role: 'guardian', index: 0, account: g1, bps: null },
];

describe('typedReason', () => {
  it('opens only for the exact address, never for a broken checksum', () => {
    // Same characters, one letter in the other case: a typo that a case-blind compare would let through.
    expect(typedReason(g2.replace('0x15d3', '0x15D3'), g2)).toBe('invalid');
    expect(typedReason(g2.toLowerCase(), g2)).toBeNull();
    expect(typedReason(` ${g2} `, g2)).toBeNull();
    expect(typedReason('', g2)).toBe('empty');
    expect(typedReason('   ', g2)).toBe('empty');
    expect(typedReason(g1, g2)).toBe('mismatch');
    expect(typedReason(zeroAddress, g2)).toBe('invalid');
    // A vote whose calldata did not decode can never be matched.
    expect(typedReason(g2, null)).toBe('mismatch');
  });
});

describe('signPlan', () => {
  it('builds the plan from the payload bytes, also while the request waits only for addresses typed again', () => {
    const p = payload(['0x01', '0x02']);
    const waiting = checkOf([step({ action: 'createVault' }), step({ index: 1, action: 'approve' })], {
      ok: false,
      confirm: { reason: 'DRILL_WITH_ALLOWANCE', addresses: asked, confirmed: false },
    });
    const plan = signPlan(p, waiting, 196);
    expect(plan?.steps.map((s) => ({ to: s.to, data: s.data, value: s.value }))).toEqual(p.steps);
    expect(plan?.steps.map((s) => s.action)).toEqual(['createVault', 'approve']);
  });

  it('gives no plan when nothing may be signed, whatever the wallet', () => {
    const one = payload([CHECK_IN]);
    expect(signPlan(one, checkOf([step({ allowed: false, action: null, reason: 'unknown call' })]), 196)).toBeNull();
    const failing = step({ simulation: { ok: false, error: new AtropyleError('NOT_OWNER').toJSON() } });
    expect(signPlan(one, checkOf([failing], { ok: false }), 196)).toBeNull();
    expect(signPlan(one, checkOf([step()], { chainId: 1 }), 196)).toBeNull();
    // A Drill to confirm whose steps the network could not simulate in order: unproven.
    const skipped = step({
      index: 1,
      action: 'approve',
      simulation: { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' },
    });
    const unproven = checkOf([step({ action: 'createVault' }), skipped], {
      ok: false,
      confirm: { reason: 'DRILL_WITH_ALLOWANCE', addresses: asked, confirmed: false },
    });
    expect(signPlan(payload(['0x01', '0x02']), unproven, 196)).toBeNull();
  });

  it('leaves the guardian warning to the page, which says it once in its own words', () => {
    const w = { code: 'UNLIMITED_APPROVAL', message: 'This approval has no limit.' } as const;
    const plan = signPlan(
      payload([vote(g2)]),
      checkOf([step({ action: 'voteRecovery', warnings: [GUARDIAN_WARNING, w] })]),
      196,
    );
    expect(plan?.warnings).toEqual([]);
    expect(plan?.steps[0].warnings).toEqual([w]);
  });
});

/** A wallet without wallet_sendCalls, so a send that passes goes to atro.send one step at a time. */
function deps(check: (p: SignPayload, o?: InspectOptions) => SignRequestCheck) {
  const request = vi.fn(async () => {
    throw Object.assign(new Error('unsupported'), { code: 4200 });
  });
  const send = vi.fn(async () => ({ vault: V, steps: [] }));
  const inspect = vi.fn(async (p: SignPayload, o?: InspectOptions) => check(p, o));
  const atro = { handoff: { inspect, calls: vi.fn() }, send } as unknown as AtropyleClient;
  return { d: { atro, provider: { request } as Eip1193, walletClient: {} as WalletClient }, inspect, request, send };
}
function planOf(p: SignPayload, c: SignRequestCheck): TxPlan {
  const plan = signPlan(p, c, 196);
  if (!plan) throw new Error('no plan');
  return plan;
}

describe('signSenderWith', () => {
  it('inspects exactly the steps it is given again, and refuses before the wallet hears anything', async () => {
    const p = payload([CHECK_IN]);
    const refusedCheck = checkOf([step({ allowed: false, action: null, reason: 'unknown call' })], { ok: false });
    const { d, inspect, request, send } = deps(() => refusedCheck);
    const refused = vi.fn();
    const sender = signSenderWith({ typed: () => '', open: () => true, refused });
    await expect(sender(d, planOf(p, checkOf([step()])), {})).rejects.toMatchObject({ code: 'LINK_INVALID' });
    expect(inspect.mock.calls[0]?.[0]).toEqual(p);
    expect(refused).toHaveBeenCalledWith(refusedCheck);
    expect(request).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing and inspects nothing while a gate of the page is closed', async () => {
    const c = checkOf([step({ action: 'voteRecovery' })]);
    const { d, inspect, request, send } = deps(() => c);
    const sender = signSenderWith({ typed: () => '', open: () => false });
    await expect(sender(d, planOf(payload([vote(g2)]), c), {})).rejects.toMatchObject({ code: 'LINK_INVALID' });
    expect(inspect).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('gives the SDK what the signer typed for each address it asks to confirm, in its order', async () => {
    const p = payload(['0x01', '0x02']);
    const steps = [step({ action: 'createVault' }), step({ index: 1, action: 'approve' })];
    const waiting = checkOf(steps, {
      ok: false,
      confirm: { reason: 'DRILL_WITH_ALLOWANCE', addresses: asked, confirmed: false },
    });
    const passed = checkOf(steps, { confirm: { reason: 'DRILL_WITH_ALLOWANCE', addresses: asked, confirmed: true } });
    const { d, inspect, send } = deps((_p, o) => (o?.confirmed ? passed : waiting));
    const typed: Record<string, string> = {
      [`${V.toLowerCase()}:heir:0`]: heirA.toLowerCase(),
      [`${V.toLowerCase()}:guardian:0`]: ` ${g1} `,
    };
    const sender = signSenderWith({
      typed: (a) => typed[`${a.vault.toLowerCase()}:${a.role}:${a.index}`] ?? '',
      open: () => true,
    });
    await sender(d, planOf(p, waiting), {});
    expect(inspect.mock.calls.at(-1)?.[1]).toEqual({ confirmed: [heirA.toLowerCase(), ` ${g1} `] });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('signAssets', () => {
  it('reads the asset kinds from the calldata of an allowed createVault or setAssets', () => {
    const SET = encodeFunctionData({
      abi: vaultAbi,
      functionName: 'setAssets',
      args: [assetsToAbi([{ kind: 'erc1155', token: stranger, id: 7n, heir: 0 }])],
    });
    expect(signAssets(payload([CREATE], [FACTORY]), checkOf([step({ to: FACTORY, action: 'createVault' })]))).toEqual([
      { token: USD, kind: 'erc20' },
      { token: NFT, kind: 'erc721' },
    ]);
    expect(signAssets(payload([SET]), checkOf([step({ action: 'setAssets' })]))).toEqual([
      { token: stranger, kind: 'erc1155' },
    ]);
  });

  it('reads through a builder code suffix, and skips refused or undecodable steps', () => {
    const other = createOf([{ kind: 'erc20', token: stranger, id: 0n, heir: 0 }]);
    const p = payload(
      [appendSuffix(CREATE, builderCodeSuffix('atropyle')), other, '0xdc350bf8'],
      [FACTORY, FACTORY, FACTORY],
    );
    const c = checkOf([
      step({ to: FACTORY, action: 'createVault', builderCodes: ['atropyle'] }),
      step({ index: 1, to: FACTORY, action: 'createVault', allowed: false, reason: 'a second createVault' }),
      step({ index: 2, to: FACTORY, action: 'createVault' }),
    ]);
    expect(signAssets(p, c)).toEqual([
      { token: USD, kind: 'erc20' },
      { token: NFT, kind: 'erc721' },
    ]);
  });
});

describe('signTokens', () => {
  it('reads nothing for a request that grants no token', async () => {
    const vault = vi.fn();
    const read = vi.fn();
    const atro = { vault } as unknown as AtropyleClient;
    expect(await signTokens(atro, payload([CHECK_IN]), checkOf([step()]), read)).toEqual([]);
    expect(vault).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("takes an existing vault's assets from its own list on chain", async () => {
    const info: TokenInfo = {
      address: NFT,
      symbol: untrusted('MNFT', 16),
      name: untrusted('Mock NFT', 32),
      decimals: null,
    };
    const snapshot = vi.fn(async () => ({
      status: {
        assets: [
          { index: 0, asset: { kind: 'erc721', token: NFT, id: 2n, heir: 0 }, token: info, coverage: 0n, held: 1n },
        ],
      },
    }));
    const vault = vi.fn(() => ({ snapshot }));
    const read = vi.fn();
    const revoke = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [zeroAddress, 2n] });
    const out = await signTokens(
      { vault } as unknown as AtropyleClient,
      payload([revoke], [NFT]),
      checkOf([step({ to: NFT, action: 'approve' })]),
      read,
    );
    expect(vault).toHaveBeenCalledWith(V);
    expect(out).toEqual([{ address: NFT, kind: 'erc721', symbol: info.symbol, decimals: null }]);
    expect(read).not.toHaveBeenCalled();
  });

  it('reads the symbol and decimals of what a new vault lists, and keeps the kind when a read fails', async () => {
    const usd: TokenInfo = {
      address: USD,
      symbol: untrusted('USDT0', 16),
      name: untrusted('Tether USD', 32),
      decimals: 6,
    };
    const read = vi.fn(async (a: Address) => {
      if (a === USD) return usd;
      throw new Error('not a token');
    });
    const vault = vi.fn();
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [V, maxUint256] });
    const c = checkOf([
      step({ to: FACTORY, action: 'createVault', create: TERMS }),
      step({ index: 1, to: USD, action: 'approve' }),
    ]);
    const out = await signTokens(
      { vault } as unknown as AtropyleClient,
      payload([CREATE, approve], [FACTORY, USD]),
      c,
      read,
    );
    expect(out).toEqual([
      { address: USD, kind: 'erc20', symbol: usd.symbol, decimals: 6 },
      { address: NFT, kind: 'erc721', symbol: null, decimals: null },
    ]);
    // The vault this request creates does not exist yet: nothing reads it.
    expect(vault).not.toHaveBeenCalled();
  });
});
