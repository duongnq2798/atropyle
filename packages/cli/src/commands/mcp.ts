import { assertRpcChain } from '@atropyle/mcp/ops';
import { AtropyleError } from '@atropyle/sdk';
import type { Command } from 'commander';
import { deploymentFor, sdkOptionsFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT, UsageError } from '../exit';

export function registerMcp(program: Command, ctx: Ctx): void {
  program
    .command('mcp')
    .description('run the Atropyle MCP server on stdio (the same server as npx -y @atropyle/mcp)')
    .action(
      action(ctx, 'mcp', async (g) => {
        if (g.json) throw new UsageError('--json does not apply to mcp: stdout carries the MCP protocol.');
        const deployment = await deploymentFor(g, ctx.io);
        if (g.rpc) {
          try {
            await assertRpcChain(g.rpc, deployment.chainId, { fetch: ctx.io.fetch });
          } catch (e) {
            // A wrong chain is fatal (WRONG_CHAIN, exit 4). A down RPC is not: the tools report RPC_UNAVAILABLE later,
            // as with npx -y @atropyle/mcp. No URL in this line: it may carry an API key.
            if (!(e instanceof AtropyleError) || (e.code !== 'RPC_UNAVAILABLE' && e.code !== 'RPC_RATE_LIMITED'))
              throw e;
            ctx.io.err('atropyle-mcp: the RPC did not answer; starting anyway\n');
          }
        }
        // Not a static import: the MCP SDK is loaded only by this command, not by every CLI command (decision 8).
        const { runStdio } = await import('@atropyle/mcp');
        await runStdio({ sdk: await sdkOptionsFor(g, ctx.io, { checkRpc: false, deployment }) });
        return EXIT.ok;
      }),
    );
}
