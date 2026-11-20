import { type CheckPlanInput, checkPlan, finish, plural } from '@atropyle/mcp/ops';
import { type PlanInput, type PresetName, planTemplate, toAddress, validatePlan } from '@atropyle/sdk';
import { type Command, Option } from 'commander';
import { parseAssets, parseHeirs } from '../actions';
import { addressArg, collect, intArg } from '../args';
import { clientFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT, UsageError } from '../exit';
import { readPlan } from '../files';
import { formatPlanCheck, formatPlanInit } from '../format';
import type { Io } from '../io';
import { emit } from '../output';
import { type PlanInitOutput, PlanInitOutputSchema } from '../schemas';
import { askPlan, canAsk, ensureWritable } from './plan-wizard';

export interface PlanInitFlags {
  template?: 'simple' | 'guarded';
  preset?: PresetName;
  owner?: string;
  heir?: string[];
  guardian?: string[];
  k?: string;
  recovery?: boolean;
  asset?: string[];
  drill?: boolean;
  out: string;
  force?: boolean;
}

/**
 * The plan document, before validation. Template: guarded when guardians are given, else simple.
 * Recovery is opt-in: planTemplate('guarded') would turn it on, but guardians who can take over the wallet need an
 * explicit yes from the owner.
 */
function buildPlan(f: PlanInitFlags): PlanInput {
  const guardians = f.guardian ?? [];
  const assets = f.asset ?? [];
  const template = f.template ?? (guardians.length > 0 ? 'guarded' : 'simple');
  if (template === 'simple' && (guardians.length > 0 || f.k !== undefined || f.recovery === true)) {
    throw new UsageError('The simple template has no guardians. Use --template guarded.');
  }
  if (template === 'guarded' && guardians.length === 0) {
    throw new UsageError('The guarded template needs at least one --guardian <address>.');
  }
  const drill = f.drill === true;
  const body = planTemplate(template, {
    heirs: parseHeirs(f.heir ?? []),
    ...(template === 'guarded'
      ? {
          guardians: guardians.map((g, i) => toAddress(g, `guardian ${i + 1}`)),
          recoveryEnabled: f.recovery === true,
          ...(f.k === undefined ? {} : { k: intArg(f.k, '--k') }),
        }
      : {}),
    timing: f.preset ?? (drill ? 'drill' : 'sixMonths'),
    ...(assets.length > 0 ? { assets: parseAssets(assets) } : {}),
    drill,
  });
  return { version: 1, ...(f.owner === undefined ? {} : { owner: toAddress(f.owner, 'owner') }), ...body };
}

/** A path that runs as printed in a POSIX shell. */
const shellQuote = (path: string): string =>
  /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;

export async function planInit(io: Io, f: PlanInitFlags): Promise<{ out: PlanInitOutput; code: number }> {
  const doc = buildPlan(f);
  const result = validatePlan(doc);
  if (!result.ok) {
    const out = finish(PlanInitOutputSchema, {
      ok: false,
      file: f.out,
      written: false,
      plan: doc,
      config: null,
      issues: result.issues,
      next: [],
      summary: `Not written: the plan has ${plural(result.issues.length, 'issue')}.`,
      warnings: [],
    });
    return { out, code: EXIT.error };
  }
  try {
    await io.writeFile(f.out, `${JSON.stringify(doc, null, 2)}\n`, { exclusive: f.force !== true });
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') {
      throw new UsageError(`${f.out} already exists. Use --force to overwrite it, or --out <file>.`);
    }
    throw e;
  }
  const c = result.config;
  const file = shellQuote(f.out);
  const as = c.owner === null ? ' --as <OWNER>' : '';
  const guardians = c.guardians.length > 0 ? `, ${plural(c.guardians.length, 'guardian')} (k = ${c.k})` : '';
  const out = finish(PlanInitOutputSchema, {
    ok: true,
    file: f.out,
    written: true,
    plan: doc,
    config: c,
    issues: [],
    next: [
      `npx -y atropyle plan check ${file}${as}`,
      `npx -y atropyle simulate --plan ${file}${as}`,
      `npx -y atropyle prepare create-vault ${file}${as}`,
    ],
    summary: `Wrote ${f.out}: ${plural(c.heirs.length, 'heir')}${guardians}, ${plural(c.assets.length, 'asset')}${c.drill ? ', as a Drill' : ''}. Check it next, then simulate it and prepare it for signing.`,
    warnings: result.warnings,
  });
  return { out, code: EXIT.ok };
}

export function registerPlan(program: Command, ctx: Ctx): void {
  const plan = program.command('plan').description('create and check atropyle.plan.json files');

  plan
    .command('init')
    .description('write atropyle.plan.json from flags; in a terminal without --heir, ask one question at a time')
    .addOption(
      new Option('--template <name>', 'simple: heirs only; guarded: heirs and guardians').choices([
        'simple',
        'guarded',
      ]),
    )
    .addOption(new Option('--preset <name>', 'timing preset').choices(['drill', 'sixMonths', 'twelveMonths']))
    .option('--owner <address>', 'owner wallet; plan check and prepare can take --as instead')
    .option('--heir <address[:percent]>', 'an heir and their share; repeat for each heir', collect)
    .option('--guardian <address>', 'a guardian; repeat for each guardian', collect)
    .option('--k <n>', 'how many guardians must agree')
    .option(
      '--recovery',
      'k guardians together can release the vault to a new wallet they choose, for a lost wallet; off unless you give this flag',
    )
    .option(
      '--asset <kind:token[:id][@heir]>',
      "an asset the vault covers; repeat for each; @heir is the heir's index, counting from 0",
      collect,
    )
    .option('--drill', 'a practice vault: minutes instead of months, expires after 7 days')
    .option('--out <file>', 'file to write', 'atropyle.plan.json')
    .option('--force', 'overwrite the file if it exists')
    .action(
      action(ctx, 'plan init', async (g, cmd) => {
        let flags = cmd.opts<PlanInitFlags>();
        if ((flags.heir ?? []).length === 0 && canAsk(ctx.io, g)) {
          await ensureWritable(ctx.io, flags);
          flags = await askPlan(ctx.io, flags);
        }
        const { out, code } = await planInit(ctx.io, flags);
        emit(ctx, g, out, formatPlanInit);
        return code;
      }),
    );

  plan
    .command('check')
    .description('validate a plan file, check its tokens on chain and show the current fee')
    .argument('<file>', 'plan file')
    .option('--as <address>', 'owner; defaults to "owner" in the file')
    .option('--drill', 'check it as a Drill')
    .action(
      action(ctx, 'plan check', async (g, cmd, file: string) => {
        const o = cmd.opts<{ as?: string; drill?: boolean }>();
        // Flags are checked before the file is read: a usage error beats a missing file.
        const owner = o.as === undefined ? undefined : addressArg(o.as, 'as');
        const input: CheckPlanInput = {
          plan: (await readPlan(ctx.io, file)) as CheckPlanInput['plan'],
          ...(owner === undefined ? {} : { owner }),
          ...(o.drill ? { drill: true } : {}),
        };
        const out = await checkPlan(await clientFor(g, ctx.io), input);
        emit(ctx, g, out, formatPlanCheck);
        return out.ok ? EXIT.ok : EXIT.error;
      }),
    );
}
