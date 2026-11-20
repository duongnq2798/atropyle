import {
  type PrepareActionInput,
  type PrepareCreateVaultInput,
  type PrepareOutput,
  prepareAction,
  prepareCreateVault,
} from '@atropyle/mcp/ops';
import { type Command, Option } from 'commander';
import { ACTION_LIST, ACTIONS, buildAction } from '../actions';
import { type ActionFlags, addActionOptions, addressArg, givenFlags } from '../args';
import { clientFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT, redactUrl, UsageError } from '../exit';
import { readPlan } from '../files';
import { briefPrepare, formatPrepare } from '../format';
import type { Globals } from '../globals';
import { emit } from '../output';
import { renderQr } from '../qr';
import { styleFor } from '../style';

export const PREPARE_FORMATS: string[] = ['link', 'cast', 'calls', 'okx', 'json'];
const NO_OKX_NOTE = 'No OKX Agentic Wallet commands: a step sends native value. Use --format link, cast or calls.';

export type PrepareFlags = ActionFlags & {
  as?: string;
  format: string;
  allowance?: 'exact' | 'unlimited';
  drill?: boolean;
  feeToken?: string;
  salt?: string;
  at?: string;
  webUrl?: string;
  qr?: boolean;
};

function saltArg(v: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new UsageError('--salt must be 0x followed by 64 hex digits.');
  return v;
}

async function prepareOf(ctx: Ctx, g: Globals, name: string, target: string, o: PrepareFlags): Promise<PrepareOutput> {
  const common = {
    ...(o.allowance === undefined ? {} : { allowance: o.allowance }),
    ...(o.webUrl === undefined ? {} : { webUrl: o.webUrl }),
  };
  if (name === 'create-vault') {
    const stray = givenFlags(o);
    if (stray.length > 0) throw new UsageError(`--${stray[0]} does not apply to create-vault.`);
    if (o.at !== undefined) throw new UsageError('--at does not apply to create-vault.');
    // Flags are checked before the plan file is read, so a bad flag is a usage error even when the file is missing.
    const flags = {
      ...(o.as === undefined ? {} : { owner: addressArg(o.as, 'as') }),
      ...(o.drill ? { drill: true } : {}),
      ...(o.feeToken === undefined ? {} : { feeToken: addressArg(o.feeToken, 'fee-token') }),
      ...(o.salt === undefined ? {} : { salt: saltArg(o.salt) }),
    };
    const input: PrepareCreateVaultInput = {
      plan: (await readPlan(ctx.io, target)) as PrepareCreateVaultInput['plan'],
      ...flags,
      ...common,
    };
    return prepareCreateVault(await clientFor(g, ctx.io), input);
  }
  // Own keys only (as in actionTypeOf); this check also names create-vault in the message.
  if (!Object.hasOwn(ACTIONS, name)) {
    throw new UsageError(`Unknown action "${redactUrl(name)}". Use create-vault or one of: ${ACTION_LIST}.`);
  }
  if (o.drill || o.feeToken !== undefined || o.salt !== undefined) {
    throw new UsageError('--drill, --fee-token and --salt only apply to create-vault.');
  }
  if (o.as === undefined) throw new UsageError('Say who signs with --as <address>.');
  const input: PrepareActionInput = {
    vault: addressArg(target, 'vault'),
    action: buildAction(name, o),
    as: addressArg(o.as, 'as'),
    ...(o.at === undefined ? {} : { at: o.at }),
    ...common,
  };
  return prepareAction(await clientFor(g, ctx.io), input);
}

/**
 * Prints `out` in the requested format and returns the exit code.
 * Decision 13: a blocked plan prints no link, no QR code and no cast command, and exits 1.
 * Nothing to sign is not a failure: the summary says so, and no link is printed.
 * An empty stdout must not look like success: `--format cast` with no cast commands (the SDK refused the RPC URL), and `--format okx` with no okx commands (a step sends native value), exit 1.
 */
export function handOver(ctx: Ctx, g: Globals, o: PrepareFlags, out: PrepareOutput): number {
  const { io } = ctx;
  const s = styleFor(io, g);
  const code = out.blocked ? EXIT.error : EXIT.ok;
  // The gate does not trust the ops layer to keep `blocked` and `handoff` exclusive.
  const shown = out.blocked ? { ...out, handoff: null } : out;
  if (g.json) {
    emit(ctx, g, shown, () => '');
    return code;
  }
  if (o.format === 'cast' || o.format === 'calls' || o.format === 'okx') {
    io.err(briefPrepare(shown, s, o.format === 'okx'));
    if (!shown.handoff) return code;
    if (o.format === 'okx') {
      if (shown.handoff.okx === null) {
        io.err(`${NO_OKX_NOTE}\n`);
        return EXIT.error;
      }
      io.out(`${shown.handoff.okx.join('\n')}\n`);
      return code;
    }
    if (o.format === 'cast') {
      if (shown.handoff.cast.length === 0) return EXIT.error;
      io.out(`${shown.handoff.cast.join('\n')}\n`);
    } else {
      io.out(`${JSON.stringify(shown.handoff.calls, null, 2)}\n`);
    }
    return code;
  }
  const link = shown.handoff?.link ?? null;
  const wantQr = link !== null && (o.qr === true || (o.qr === undefined && io.isTTY));
  const qr = wantQr ? renderQr(link, io.columns) : null;
  io.out(formatPrepare(shown, s, qr?.qr ?? null, qr?.note ?? null));
  return code;
}

export function registerPrepare(program: Command, ctx: Ctx): void {
  addActionOptions(
    program
      .command('prepare')
      .description('prepare and simulate transactions, then hand them to your wallet; never signs')
      .argument('<action>', `create-vault, or one of: ${ACTION_LIST}`)
      .argument('<target>', 'plan file for create-vault, vault address otherwise')
      .option('--as <address>', 'who signs; for create-vault, defaults to "owner" in the plan')
      .addOption(
        new Option(
          '--format <format>',
          'link (with a QR code), cast, calls (wallet_sendCalls), okx (OKX Agentic Wallet) or json',
        )
          .choices(PREPARE_FORMATS)
          .default('link'),
      )
      .addOption(new Option('--allowance <kind>', 'token approvals').choices(['exact', 'unlimited']))
      .option('--drill', 'create-vault: create a Drill, a practice vault')
      .option('--fee-token <address>', 'create-vault: pay the fee with this token')
      .option('--salt <hex>', 'create-vault: 32-byte salt that fixes the vault address')
      .option(
        '--at <time>',
        'predict the effect at this time (shown in --json); steps are simulated now. Unix seconds, ISO 8601 or +<duration>',
      )
      .option('--web-url <url>', 'web app that opens the signing link')
      .option('--qr', 'always print a QR code of the link')
      .option('--no-qr', 'never print a QR code'),
  ).action(
    action(ctx, 'prepare', async (g, cmd, name: string, target: string) => {
      const o = cmd.opts<PrepareFlags>();
      if (o.webUrl !== undefined && !URL.canParse(o.webUrl)) throw new UsageError('--web-url is not a valid URL.');
      return handOver(ctx, g, o, await prepareOf(ctx, g, name, target, o));
    }),
  );
}
