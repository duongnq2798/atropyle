import { type SimulateInput, simulate } from '@atropyle/mcp/ops';
import type { Command } from 'commander';
import { ACTION_LIST, buildAction } from '../actions';
import { type ActionFlags, addActionOptions, addressArg, givenFlags } from '../args';
import { clientFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT, UsageError } from '../exit';
import { readPlan } from '../files';
import { formatSimulate } from '../format';
import { emit } from '../output';

type Flags = ActionFlags & { as?: string; at?: string; plan?: string; drill?: boolean };

export function registerSimulate(program: Command, ctx: Ctx): void {
  addActionOptions(
    program
      .command('simulate')
      .description('what an action would do now or later (whatIf), or the timeline of a plan file')
      .argument('[vault]', 'vault address')
      .argument('[action]', `one of: ${ACTION_LIST}`)
      .option('--as <address>', 'who acts; with --plan, the owner')
      .option(
        '--at <time>',
        'unix seconds, an ISO 8601 date (UTC midnight) or date-time with its zone (2027-01-01T00:00:00Z), or +<duration> after the latest block, such as +3d',
      )
      .option('--plan <file>', 'preview the timeline of this plan file instead')
      .option('--drill', 'with --plan: preview it as a Drill'),
  ).action(
    action(ctx, 'simulate', async (g, cmd, vault?: string, name?: string) => {
      const o = cmd.opts<Flags>();
      let input: SimulateInput;
      if (o.plan !== undefined) {
        if (vault !== undefined || name !== undefined) {
          throw new UsageError('Give --plan <file>, or a vault and an action, not both.');
        }
        if (givenFlags(o).length > 0 || o.at !== undefined) {
          throw new UsageError('Action flags and --at do not apply with --plan.');
        }
        input = {
          plan: (await readPlan(ctx.io, o.plan)) as SimulateInput['plan'],
          ...(o.as === undefined ? {} : { as: addressArg(o.as, 'as') }),
          ...(o.drill ? { drill: true } : {}),
        };
      } else {
        if (vault === undefined || name === undefined)
          throw new UsageError('Give a vault and an action, or --plan <file>.');
        if (o.as === undefined) throw new UsageError('Say who acts with --as <address>.');
        if (o.drill) throw new UsageError('--drill only applies with --plan.');
        input = {
          vault: addressArg(vault, 'vault'),
          action: buildAction(name, o),
          as: addressArg(o.as, 'as'),
          ...(o.at === undefined ? {} : { at: o.at }),
        };
      }
      emit(ctx, g, await simulate(await clientFor(g, ctx.io), input), formatSimulate);
      return EXIT.ok;
    }),
  );
}
