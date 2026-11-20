import { listVaults } from '@atropyle/mcp/ops';
import type { Command } from 'commander';
import { addressArg } from '../args';
import { clientFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT } from '../exit';
import { formatVaults } from '../format';
import { emit } from '../output';

export function registerVaults(program: Command, ctx: Ctx): void {
  program
    .command('vaults')
    .description('vaults where an account is owner, heir or guardian')
    .argument('<account>', 'account address')
    .action(
      action(ctx, 'vaults', async (g, _cmd, account: string) => {
        const input = { account: addressArg(account, 'account') };
        emit(ctx, g, await listVaults(await clientFor(g, ctx.io), input), formatVaults);
        return EXIT.ok;
      }),
    );
}
