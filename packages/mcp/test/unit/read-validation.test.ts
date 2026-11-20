import type { AtropyleClient } from '@atropyle/sdk';
import { HttpRequestError } from 'viem';
import { describe, expect, it } from 'vitest';
import { getVault, latestTimestamp, simulate } from '../../src/ops/index';

const VAULT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const PLAN = { heirs: [{ account: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }], timing: 'drill' as const };

/** Any use of the client is an RPC: a test passes only when the input is rejected before that. */
const dead = new Proxy(
  {},
  {
    get() {
      throw new Error('RPC reached');
    },
  },
) as AtropyleClient;

describe('read operations validate before any RPC', () => {
  it('getVault rejects a bad `as`', async () => {
    await expect(getVault(dead, { vault: VAULT, as: 'nope' })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('simulate rejects a bad `at`, and a bad `as` in plan mode as an address error, not a plan error', async () => {
    await expect(
      simulate(dead, { vault: VAULT, action: { type: 'checkIn' }, as: VAULT, at: 'tomorrow' }),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(simulate(dead, { plan: PLAN, as: 'nope' })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('simulate refuses mixed or incomplete modes', async () => {
    const both = { plan: PLAN, vault: VAULT, action: { type: 'checkIn' as const }, as: VAULT };
    await expect(simulate(dead, both)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(simulate(dead, { vault: VAULT, action: { type: 'checkIn' } })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    });
    await expect(simulate(dead, { plan: PLAN, at: '+3d' })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(
      simulate(dead, { vault: VAULT, action: { type: 'checkIn' }, as: VAULT, drill: true }),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('simulate says when the Drill will have expired by the chosen time', async () => {
    const report = (drillExpired: boolean) =>
      ({
        action: 'poke',
        as: VAULT,
        effect: {
          at: 1_800_000_000n,
          engine: 'model',
          from: 'active',
          next: 'active',
          alarm: false,
          cancel: false,
          release: false,
          drillExpired,
          recoveryTarget: null,
          recipients: [],
          inputs: { idle: 0, threshold: 1, inhVotes: 0, recVotes: 0, k: 0, alive: true, windowDone: false },
        },
        simulation: { ok: 'skipped', reason: 'FUTURE_TIME' },
      }) as const;
    const client = (drillExpired: boolean) =>
      ({ vault: () => ({ whatIf: async () => report(drillExpired) }) }) as unknown as AtropyleClient;
    const input = { vault: VAULT, action: { type: 'poke' as const }, as: VAULT };
    expect((await simulate(client(true), input)).summary).toContain('The Drill will have expired by then');
    expect((await simulate(client(false), input)).summary).not.toContain('expired');
  });

  it('latestTimestamp turns a viem HTTP failure into the SDK transport error', async () => {
    const down = {
      publicClient: {
        getBlock: () => {
          throw new HttpRequestError({ url: 'https://rpc.example', status: 429 });
        },
      },
    } as unknown as AtropyleClient;
    const e = await latestTimestamp(down).catch((x) => x);
    expect(e).toMatchObject({ name: 'AtropyleError', code: 'RPC_RATE_LIMITED' });
  });
});
