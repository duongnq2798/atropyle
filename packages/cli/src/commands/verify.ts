import { throttleProgress, verify } from '@atropyle/mcp/ops';
import type { Command } from 'commander';
import { addressArg, collect } from '../args';
import { clientFor, verifyGroups } from '../client';
import { action, type Ctx } from '../context';
import { EXIT } from '../exit';
import { formatVerify } from '../format';
import type { Io } from '../io';
import { emit } from '../output';

interface Flags {
  vault?: string;
  policy: boolean;
  singleRpc?: boolean;
  verifyRpc?: string[];
}

/** One stderr line, rewritten about once per percent. */
function progressLine(io: Io) {
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
    .description('prove the policy circuit over all 2^26 inputs from independent RPCs; --vault checks a vault too')
    .option('--vault <address>', 'also check this vault against the deployment')
    .option('--no-policy', 'skip the 2^26 proof and only check the vault')
    .option('--single-rpc', 'read from the first RPC operator only (warns SINGLE_RPC)')
    .option('--verify-rpc <url>', 'an RPC operator; repeat for each; replaces the deployment list', collect)
    .action(
      action(ctx, 'verify', async (g, cmd) => {
        const o = cmd.opts<Flags>();
        const input = {
          ...(o.vault === undefined ? {} : { vault: addressArg(o.vault, 'vault') }),
          ...(o.policy ? {} : { policy: false }),
        };
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
