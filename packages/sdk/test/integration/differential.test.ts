import fc from 'fast-check';
import { type Address, encodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import { ANVIL_ACCOUNTS, rpc } from '../../../../scripts/lib/anvil';
import { vaultAbi } from '../../src/abi/index';
import { createAtropyle, PRESETS, type VaultAction } from '../../src/index';
import { createVaultRaw, devnet, revertChain, sendRaw, snapshotChain, walletOf } from './helpers';

const [, OWNER, HEIR, G1, G2, G3, NEW_WALLET, , STRANGER] = ANVIL_ACCOUNTS as unknown as Address[];
const GUARDIANS = [G1, G2, G3];

type Cmd =
  | { kind: 'wait'; seconds: number }
  | { kind: 'checkIn' }
  | { kind: 'attest'; g: number; on: boolean }
  | { kind: 'vote'; g: number; target: 'new' | 'heir' | null }
  // Signed by the owner, poke is a check-in (Plan 1); signed by anyone else it only applies the policy.
  | { kind: 'poke'; byOwner: boolean };

const cmd: fc.Arbitrary<Cmd> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({ kind: fc.constant('wait' as const), seconds: fc.integer({ min: 1, max: 200 }) }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'checkIn' as const }) },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('attest' as const), g: fc.integer({ min: 0, max: 2 }), on: fc.boolean() }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('vote' as const),
      g: fc.integer({ min: 0, max: 2 }),
      target: fc.constantFrom('new' as const, 'heir' as const, null),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('poke' as const), byOwner: fc.boolean() }) },
);

function toAction(c: Exclude<Cmd, { kind: 'wait' }>): { action: VaultAction; as: Address } {
  if (c.kind === 'checkIn') return { action: { type: 'checkIn' }, as: OWNER };
  if (c.kind === 'attest') return { action: { type: 'attestDeath', on: c.on }, as: GUARDIANS[c.g] };
  if (c.kind === 'vote') {
    const target = c.target === 'new' ? NEW_WALLET : c.target === 'heir' ? HEIR : null;
    return { action: { type: 'voteRecovery', target }, as: GUARDIANS[c.g] };
  }
  return { action: { type: 'poke' }, as: c.byOwner ? OWNER : STRANGER };
}

describe('SDK prediction matches the contract (spec §12.2)', () => {
  const env = devnet();
  const atro = createAtropyle({ chain: env.deployment, builderCode: null });
  const setNext = (t: bigint) => rpc(env.rpcUrl, 'evm_setNextBlockTimestamp', [Number(t)]);
  const poke = encodeFunctionData({ abi: vaultAbi, functionName: 'poke' });

  it('whatIf equals status().pending after every step, and timeline equals a real poke', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmd, { minLength: 1, maxLength: 10 }), async (cmds) => {
        const snap = await snapshotChain(env.rpcUrl);
        try {
          const vault = await createVaultRaw(env, {
            owner: OWNER,
            params: {
              heirs: [{ account: HEIR, bps: 10000 }],
              guardians: GUARDIANS,
              k: 2,
              recoveryEnabled: true,
              timing: PRESETS.drill,
              assets: [],
            },
          });
          const v = atro.vault(vault);
          for (const c of cmds) {
            const s = await v.status();
            const now = await v.whatIf({ type: 'poke' }, { as: STRANGER });
            expect(now.effect?.at).toBe(s.blockTimestamp);
            expect(now.effect?.next).toBe(s.pending);
            if (c.kind === 'wait') {
              await setNext(s.blockTimestamp + BigInt(c.seconds));
              await rpc(env.rpcUrl, 'evm_mine');
              continue;
            }
            const { action, as } = toAction(c);
            const at = s.blockTimestamp + 1n;
            const plan = await v.prepare(action, { as, at });
            const step = plan.steps[0];
            if (step.simulation.ok !== true || !step.effect) continue;
            await setNext(at);
            try {
              await atro.send(plan, walletOf(env.rpcUrl, as));
            } catch {
              continue; // reverted only because of the extra second; the next whatIf check still runs
            }
            const after = await v.status();
            expect(after.state).toBe(step.effect.next);
            expect(after.recoveryTarget?.toLowerCase() ?? null).toBe(step.effect.recoveryTarget?.toLowerCase() ?? null);
          }
          const s = await v.status();
          const e = (await v.timeline()).events.find((x) => x.kind !== 'drillExpiry');
          if (e && e.at > s.blockTimestamp + 1n) {
            await setNext(e.at - 1n);
            await sendRaw(env, { from: STRANGER, to: vault, data: poke });
            expect((await v.status()).state).toBe(e.from);
            await setNext(e.at);
            await sendRaw(env, { from: STRANGER, to: vault, data: poke });
            expect((await v.status()).state).toBe(e.state);
          }
        } finally {
          await revertChain(env.rpcUrl, snap);
        }
      }),
      { numRuns: 20 },
    );
  }, 300_000);
});
