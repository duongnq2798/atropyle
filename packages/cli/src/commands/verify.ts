import { throttleProgress, verify } from '@atropyle/mcp/ops';
import type { Command } from 'commander';
import { addressArg, collect } from '../args';
import { clientFor, verifyGroups } from '../client';
import { action, type Ctx } from '../context';
import { EXIT, UsageError } from '../exit';
import { formatVerify } from '../format';
import type { Io } from '../io';
import { emit } from '../output';

interface Flags {
  vault?: string;
  policy: boolean;
  singleRpc?: boolean;
  verifyRpc?: string[];
  p9Seed?: string;
}

/** The P9 seed as typed: a decimal whole number. The SDK checks the range (0 to 2^64 - 1). */
function p9SeedArg(value: string): string {
  const v = value.trim();
  if (!/^\d{1,20}$/.test(v)) throw new UsageError('--p9-seed must be a whole number from 0 to 18446744073709551615.');
  return v;
}

/** One stderr line, rewritten about once per percent. */
export function progressLine(io: Io) {
  let shown = false;
  const update = throttleProgress((done, total) => {
    shown = true;
    io.err(`\rProving P1-P8: ${Math.floor((done * 100) / total)}% of ${total.toLocaleString('en-US')} combinations`);
  });
  return { update, done: () => (shown ? io.err('\n') : undefined) };
}

export function registerVerify(program: Command, ctx: Ctx): void {
  program
    .command('verify')
    .description(
      'prove the policy circuit over all 2^26 inputs and test step() on the processor (P9) from independent RPCs; --vault checks a vault too',
    )
    .option('--vault <address>', 'also check this vault against the deployment')
    .option('--no-policy', 'skip the 2^26 proof and only check the vault')
    .option('--single-rpc', 'read from the first RPC operator only (warns SINGLE_RPC)')
    .option('--verify-rpc <url>', 'an RPC operator; repeat for each; replaces the deployment list', collect)
    .option('--p9-seed <n>', 'P9: rerun the step() vectors of this seed (printed by every run) instead of a random one')
    .action(
      action(ctx, 'verify', async (g, cmd) => {
        const o = cmd.opts<Flags>();
        const input = {
          ...(o.vault === undefined ? {} : { vault: addressArg(o.vault, 'vault') }),
          ...(o.policy ? {} : { policy: false }),
          ...(o.p9Seed === undefined ? {} : { p9Seed: p9SeedArg(o.p9Seed) }),
        };
        if (!o.policy && o.vault === undefined) {
          throw new UsageError('--no-policy needs --vault: there is nothing else to verify.');
        }
        if (!o.policy && o.p9Seed !== undefined) {
          throw new UsageError('--p9-seed needs the policy proof, which P9 is part of: drop --no-policy.');
        }
        const choice = { verifyRpc: o.verifyRpc ?? [], singleRpc: o.singleRpc === true };
        const atro = await clientFor(g, ctx.io, choice);
        const progress = ctx.io.isTTY && !g.json && o.policy ? progressLine(ctx.io) : null;
        try {
          const out = await verify(atro, input, {
            operators: verifyGroups(atro.deployment, choice),
            ...(progress ? { onProgress: progress.update } : {}),
          });
          progress?.done();
          emit(ctx, g, out, formatVerify);
          return out.ok ? EXIT.ok : EXIT.verification;
        } catch (e) {
          progress?.done();
          throw e;
        }
      }),
    );
}
