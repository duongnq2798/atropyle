import { custom, HttpRequestError, type Transport } from 'viem';
import { describe, expect, it } from 'vitest';
import { type AtropyleClient, createAtropyle } from '../../src/client';
import { AtropyleError } from '../../src/errors';
import { HEIR_A, OWNER, TOKEN, VAULT } from './fixtures';

const SALT = `0x${'11'.repeat(32)}` as const;
const PLAN = { heirs: [{ account: HEIR_A }], timing: 'drill' };

const calls: [string, (atro: AtropyleClient) => Promise<unknown>][] = [
  ['engine', (a) => a.engine()],
  ['engineFor', (a) => a.engineFor(TOKEN, 1n)],
  ['fees', (a) => a.fees()],
  ['vaultsOf', (a) => a.vaultsOf(OWNER)],
  ['predictVault', (a) => a.predictVault(OWNER, SALT)],
  ['stats', (a) => a.stats()],
  ['vault.snapshot', (a) => a.vault(VAULT).snapshot()],
  ['vault.status', (a) => a.vault(VAULT).status()],
  ['vault.config', (a) => a.vault(VAULT).config()],
  ['vault.roleOf', (a) => a.vault(VAULT).roleOf(OWNER)],
  ['vault.timeline', (a) => a.vault(VAULT).timeline()],
  ['vault.events', (a) => a.vault(VAULT).events()],
  ['vault.whatIf', (a) => a.vault(VAULT).whatIf({ type: 'poke' }, { as: OWNER })],
  ['vault.prepare', (a) => a.vault(VAULT).prepare({ type: 'checkIn' }, { as: OWNER })],
  ['prepare.createVault', (a) => a.prepare.createVault(PLAN, { owner: OWNER, drill: true })],
  ['checkPlan', (a) => a.checkPlan(PLAN, { owner: OWNER, drill: true })],
];

/** A client whose RPC always fails with `error`. */
function failing(error: () => Error): AtropyleClient {
  const transport: Transport = custom(
    {
      request: async () => {
        throw error();
      },
    },
    { retryCount: 0 },
  );
  return createAtropyle({ chain: 'local', transport });
}

describe('the client leaves every read and prepare as an AtropyleError', () => {
  it.each(calls)('%s reports a rate limit as RPC_RATE_LIMITED', async (_name, call) => {
    const atro = failing(() => new HttpRequestError({ url: 'https://rpc.example', status: 429 }));
    const err = await call(atro).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtropyleError);
    expect(err).toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });

  it.each(calls)('%s wraps an unexpected failure instead of leaking it', async (_name, call) => {
    const atro = failing(() => new Error('boom'));
    const err = await call(atro).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AtropyleError);
  });

  it('rejects, rather than throws, for a bad address argument', async () => {
    const atro = failing(() => new Error('never reached'));
    await expect(atro.predictVault('nope', SALT)).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    await expect(atro.vault(VAULT).roleOf('nope')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });
});
