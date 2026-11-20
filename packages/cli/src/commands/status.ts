import { getVault } from '@atropyle/mcp/ops';
import type { Command } from 'commander';
import { addressArg } from '../args';
import { clientFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT } from '../exit';
import { formatStatus } from '../format';
import { emit } from '../output';

export function registerStatus(program: Command, ctx: Ctx): void {
  program
    .command('status')
    .description('state, deadlines, timeline, coverage and the roles of --as in a vault')
    .argument('<vault>', 'vault address')
    .option('--as <address>', 'show the roles of this account')
    .action(
      action(ctx, 'status', async (g, cmd, vault: string) => {
        const o = cmd.opts<{ as?: string }>();
        const input = {
          vault: addressArg(vault, 'vault'),
          ...(o.as === undefined ? {} : { as: addressArg(o.as, 'as') }),
        };
        emit(ctx, g, await getVault(await clientFor(g, ctx.io), input), formatStatus);
        return EXIT.ok;
      }),
    );
}
