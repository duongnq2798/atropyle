import {
  type AddressConfirmation,
  type AtropyleClient,
  AtropyleError,
  encodePayload,
  type InspectOptions,
  type SignPayload,
  type SignRequestCheck,
  sameAddress,
} from '@atropyle/sdk';
import { type Address, encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { initialForm } from '../../src/flows/impl/create-form';
import { resumeFailure, resumePlan } from '../../src/flows/impl/resume';
import { PEOPLE } from './fixtures';

const FACTORY: Address = '0x1111111111111111111111111111111111111111';
const VAULT: Address = PEOPLE.vault;
const CREATE = { to: FACTORY, data: '0xc0ffee00' as Hex, value: 0n };
const approve = (token: Address, spender: Address, n: bigint) => ({
  to: token,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, n] }),
  value: 0n,
});
/** A Drill plan: createVault at step 0, then the asset's approval to the vault. */
const drill: SignPayload = { chainId: 196, from: PEOPLE.owner, steps: [CREATE, approve(PEOPLE.token, VAULT, 5n)] };
/** A real vault: the fee approval to the factory, createVault at step 1, then the asset's approval. */
const real: SignPayload = {
  chainId: 196,
  from: PEOPLE.owner,
  steps: [approve(PEOPLE.token, FACTORY, 1n), CREATE, approve(PEOPLE.token, VAULT, 5n)],
};
const form = { ...initialForm(true), heirs: [{ account: PEOPLE.heirA, percent: '' }] };

type ConfirmFor = (o: InspectOptions | undefined) => AddressConfirmation | null;
/** A Drill whose one heir on chain is `account`: the check passes only with that address typed again. */
const heirOnChain =
  (account: Address): ConfirmFor =>
  (o) => ({
    reason: 'DRILL_WITH_ALLOWANCE',
    addresses: [{ step: 0, vault: VAULT, role: 'heir', index: 0, account, bps: 10_000 }],
    confirmed: o?.confirmed?.length === 1 && sameAddress(o.confirmed[0], account),
  });

function chain(code: Hex | undefined, confirmFor: ConfirmFor = () => null) {
  const inspect = vi.fn(async (p: SignPayload, o?: InspectOptions): Promise<SignRequestCheck> => {
    const confirm = confirmFor(o);
    return {
      ok: confirm === null || confirm.confirmed,
      chainId: p.chainId,
      from: p.from,
      vault: null,
      confirm,
      steps: p.steps.map((s, index) => ({
        index,
        to: s.to,
        value: s.value,
        action: sameAddress(s.to, FACTORY) ? 'createVault' : 'approve',
        summary: `step ${index}`,
        warnings: [],
        allowed: true,
        reason: null,
        builderCodes: null,
        simulation: { ok: true, gas: 50_000n },
        create: null,
      })),
    };
  });
  const getCode = vi.fn(async () => code);
  const atro = { publicClient: { getCode }, handoff: { inspect } } as unknown as AtropyleClient;
  return { atro, inspect, getCode };
}

const saved = (p: SignPayload, createStep: number, offset: number) => ({
  payload: encodePayload(p),
  vault: VAULT,
  createStep,
  offset,
});

describe('resumePlan', () => {
  it('goes on after createVault when the vault has code, whatever the saved offset says', async () => {
    // The wallet confirmed createVault, then the tab reloaded before the page saved it: the saved offset is 0.
    const c = chain('0x6080');
    const r = await resumePlan(c.atro, saved(drill, 0, 0), form);
    expect(r).toMatchObject({ offset: 1, total: 2, created: true });
    expect(c.getCode).toHaveBeenCalledWith({ address: VAULT });
    expect(c.inspect.mock.calls[0]?.[0].steps).toEqual([drill.steps[1]]);
    expect(r.plan?.steps.map((s) => [s.action, s.to])).toEqual([['approve', PEOPLE.token]]);
    expect(r.plan?.vault).toBe(VAULT);
  });

  it('sends the whole plan again, same calldata and salt, when the vault has no code', async () => {
    const c = chain(undefined);
    // A saved offset past createVault with no vault on chain is not trusted.
    const r = await resumePlan(c.atro, saved(drill, 0, 2), form);
    expect(r).toMatchObject({ offset: 0, total: 2, created: false });
    expect(c.inspect.mock.calls[0]?.[0].steps).toEqual(drill.steps);
  });

  it('keeps a confirmed fee approval before createVault', async () => {
    const c = chain('0x');
    const r = await resumePlan(c.atro, saved(real, 1, 1), form);
    expect(r).toMatchObject({ offset: 1, total: 3, created: false });
    expect(c.inspect.mock.calls[0]?.[0].steps).toEqual(real.steps.slice(1));
  });

  it('has nothing left to send when every step is on chain', async () => {
    const c = chain('0x6080');
    const r = await resumePlan(c.atro, saved(drill, 0, 2), form);
    expect(r).toEqual({ plan: null, offset: 2, total: 2, created: true });
    expect(c.inspect).not.toHaveBeenCalled();
  });

  it("types a Drill's heirs again from the form the plan came from, never from the payload", async () => {
    const c = chain('0x6080', heirOnChain(PEOPLE.heirA));
    const r = await resumePlan(c.atro, saved(drill, 0, 1), form);
    expect(r.plan?.steps).toHaveLength(1);
    expect(c.inspect).toHaveBeenCalledTimes(2);
    expect(c.inspect.mock.calls[1]?.[1]).toEqual({ confirmed: [PEOPLE.heirA] });
  });

  it('refuses when the heirs on chain are not the ones in the form', async () => {
    const c = chain('0x6080', heirOnChain(PEOPLE.heirB));
    const err = await resumePlan(c.atro, saved(drill, 0, 1), form).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'LINK_INVALID' });
    // The page says it in its own words: the plan no longer matches the chain.
    expect(resumeFailure(err)).toBe('mismatch');
  });

  it('names each failure that gives the same answer again, and none of the RPC', async () => {
    const c = chain('0x6080');
    const unreadable = await resumePlan(c.atro, { ...saved(drill, 0, 1), payload: 'x' }, form).catch((e) => e);
    expect(resumeFailure(unreadable)).toBe('unreadable');
    const noCreate = await resumePlan(c.atro, saved(drill, -1, 0), form).catch((e) => e);
    expect(resumeFailure(noCreate)).toBe('unreadable');
    expect(resumeFailure(new AtropyleError('RPC_UNAVAILABLE'))).toBeNull();
    expect(resumeFailure(new Error('boom'))).toBeNull();
    expect(resumeFailure(null)).toBeNull();
  });

  it('says that the saved plan, not a signing link, cannot be read', async () => {
    const c = chain('0x6080');
    await expect(resumePlan(c.atro, { ...saved(drill, 0, 1), payload: 'x' }, form)).rejects.toMatchObject({
      code: 'LINK_INVALID',
      message: 'The plan saved in this tab cannot be read.',
    });
    expect(c.getCode).not.toHaveBeenCalled();
  });

  it('does not resume a saved plan without its createVault step', async () => {
    const c = chain('0x6080');
    await expect(resumePlan(c.atro, saved(drill, -1, 0), form)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(resumePlan(c.atro, saved(drill, 2, 0), form)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    expect(c.getCode).not.toHaveBeenCalled();
  });
});
