import {
  type AtropyleClient,
  AtropyleError,
  computeTimeline,
  decodeError,
  type EvalState,
  formatDuration,
  type PlanCheck,
  type PlanConfig,
  planError,
  rolesOf,
  type Timeline,
  timelineOf,
  toAddress,
  validatePlan,
  type WhatIfReport,
  ZERO_ADDRESS,
} from '@atropyle/sdk';
import { type Address, formatUnits } from 'viem';
import { COVERAGE_WARNING, explainStatus, iso, plural } from './explain';
import { type CheckPlanInput, type GetVaultInput, type ListVaultsInput, parseAt, type SimulateInput } from './inputs';
import {
  type CheckPlanOutput,
  CheckPlanOutputSchema,
  type GetVaultOutput,
  GetVaultOutputSchema,
  type ListVaultsOutput,
  ListVaultsOutputSchema,
  type SimulateOutput,
  SimulateOutputSchema,
} from './schemas';
import { finish } from './untrusted';

/** Drill vaults expire seven days after creation (core spec §4.1). */
export const DRILL_LIFETIME = 604_800n;

export async function latestTimestamp(atro: AtropyleClient): Promise<bigint> {
  try {
    return (await atro.publicClient.getBlock({ blockTag: 'latest' })).timestamp;
  } catch (e) {
    throw decodeError(e);
  }
}

const OWNER_HINT = 'Set "owner" in the plan, or give the owner address.';

/** A PLAN_INVALID about the plan's own `owner` field, in the SDK's issue form (dotted path, PlanIssueCode). */
function ownerIssue(code: 'REQUIRED' | 'INVALID_ADDRESS', message: string, cause?: unknown): AtropyleError {
  const base = planError([{ path: 'owner', code, message }]);
  return new AtropyleError('PLAN_INVALID', { message: base.message, hint: OWNER_HINT, details: base.details, cause });
}

/**
 * The owner of a plan: the explicit one (a tool or command-line argument: a bad value is INVALID_ADDRESS), else the
 * plan's `owner` field (a bad value means the plan is wrong: PLAN_INVALID, issue `owner`). Missing from both is
 * PLAN_INVALID too.
 */
export function planOwner(plan: unknown, owner?: string): Address {
  if (owner !== undefined) return toAddress(owner, 'owner');
  const fromPlan = typeof plan === 'object' && plan !== null ? (plan as { owner?: unknown }).owner : undefined;
  if (fromPlan === undefined) throw ownerIssue('REQUIRED', 'owner: required for on-chain checks');
  try {
    return toAddress(fromPlan, 'owner');
  } catch (e) {
    throw ownerIssue('INVALID_ADDRESS', 'owner: not a valid address', e);
  }
}

export async function getVault(atro: AtropyleClient, input: GetVaultInput): Promise<GetVaultOutput> {
  const as = input.as === undefined ? null : toAddress(input.as, 'as');
  const snap = await atro.vault(input.vault).snapshot();
  const { status, config, binding } = snap;
  const timeline = timelineOf(await atro.engineFor(binding.cpu, binding.policyId), snap, status.blockTimestamp);
  const roles = as === null ? null : rolesOf(snap, as);
  const parts = [
    `Vault ${status.vault} is ${status.state}${status.pending !== status.state ? `, and a move to ${status.pending} is due` : ''}.`,
  ];
  if (as !== null && roles !== null) {
    parts.push(roles.length > 0 ? `${as} is ${roles.join(' and ')}.` : `${as} has no role in this vault.`);
  }
  if (timeline.nextCheckAt !== null) parts.push(`Next change: ${iso(timeline.nextCheckAt)}.`);
  return finish(GetVaultOutputSchema, {
    vault: status.vault,
    chainId: status.chainId,
    blockNumber: status.blockNumber,
    config,
    status,
    binding,
    timeline,
    as,
    roles,
    explanation: explainStatus(status, config, timeline),
    summary: parts.join(' '),
    warnings: status.assets.some((a) => a.coverage < a.held) ? [COVERAGE_WARNING] : [],
  });
}

export async function listVaults(atro: AtropyleClient, input: ListVaultsInput): Promise<ListVaultsOutput> {
  const account = toAddress(input.account, 'account');
  const vaults = await atro.vaultsOf(account);
  const counts = new Map<string, number>();
  for (const v of vaults) for (const r of v.roles) counts.set(r, (counts.get(r) ?? 0) + 1);
  const byRole = [...counts].map(([role, n]) => `${role} of ${n}`).join(', ');
  return finish(ListVaultsOutputSchema, {
    account,
    vaults,
    summary:
      vaults.length === 0
        ? `${account} has no Atropyle vaults.`
        : `${account} is ${byRole} (${plural(vaults.length, 'vault')}).`,
    warnings: [],
  });
}

function whatIfSummary(r: WhatIfReport): string {
  const s = r.simulation;
  const sim =
    s.ok === true
      ? `The transaction simulates fine (gas ${s.gas}).`
      : s.ok === false
        ? `The transaction would revert with ${s.error.code}.`
        : `The transaction was not simulated (${s.reason}).`;
  if (!r.effect) return `${r.action} by ${r.as} does not change the policy state, or this account cannot do it. ${sim}`;
  const e = r.effect;
  const flags = [e.alarm && 'raises the alarm', e.cancel && 'cancels the alarm', e.release && 'releases the assets']
    .filter(Boolean)
    .join(', ');
  const pays = e.release ? ` Distribute would then make ${plural(e.recipients.length, 'transfer')}.` : '';
  const expired = e.drillExpired ? ' The Drill will have expired by then, so it can no longer release anything.' : '';
  return `${r.action} by ${r.as}: ${e.from} -> ${e.next}${flags ? ` (${flags})` : ''}.${pays}${expired} ${sim}`;
}

function planTimelineSummary(c: PlanConfig, t: Timeline): string {
  const alarm = t.events.find((e) => e.kind === 'alarm');
  const release = t.events.find((e) => e.kind === 'release');
  const what = c.drill ? 'this Drill' : 'this vault';
  const head = release
    ? `If the owner never checks in after creating ${what} now, the alarm goes off at ${iso(alarm?.at ?? null) ?? 'no time'} and the assets are released at ${iso(release.at)}.`
    : `If the owner never checks in after creating ${what} now, nothing is released before ${iso(t.milestones.expiresAt) ?? 'the end of the preview'}.`;
  const drill =
    c.drill && t.milestones.expiresAt !== null ? ` The Drill expires at ${iso(t.milestones.expiresAt)}.` : '';
  return `${head}${drill} Each check-in restarts the clock; the owner should check in every ${formatDuration(c.timing.period)}.`;
}

async function simulatePlan(atro: AtropyleClient, input: SimulateInput): Promise<SimulateOutput> {
  if (input.at !== undefined)
    throw new AtropyleError('INVALID_OPTIONS', { message: '`at` applies to action mode only.' });
  const ctx: { owner?: string; drill?: boolean } = {};
  if (input.as !== undefined) ctx.owner = toAddress(input.as, 'as');
  if (input.drill !== undefined) ctx.drill = input.drill;
  const result = validatePlan(input.plan, ctx);
  if (!result.ok) throw planError(result.issues);
  const c = result.config;
  const now = await latestTimestamp(atro);
  const s: EvalState = {
    state: 0,
    owner: c.owner ?? ZERO_ADDRESS,
    lastAlive: now,
    alarmAt: 0n,
    timing: c.timing,
    k: c.k,
    recoveryEnabled: c.recoveryEnabled,
    guardians: c.guardians,
    inhVotes: 0,
    recVotes: c.guardians.map(() => null),
    recoveryTarget: null,
  };
  const timeline = computeTimeline(await atro.engine(), s, now, c.drill ? now + DRILL_LIFETIME : null);
  return finish(SimulateOutputSchema, {
    mode: 'plan',
    vault: null,
    as: c.owner,
    action: null,
    at: now,
    effect: null,
    simulation: null,
    timeline,
    config: c,
    summary: planTimelineSummary(c, timeline),
    warnings: result.warnings,
  });
}

export async function simulate(atro: AtropyleClient, input: SimulateInput): Promise<SimulateOutput> {
  if (input.plan !== undefined) {
    if (input.vault !== undefined || input.action !== undefined) {
      throw new AtropyleError('INVALID_OPTIONS', { message: 'Give a plan, or a vault and an action, not both.' });
    }
    return simulatePlan(atro, input);
  }
  if (input.vault === undefined || input.action === undefined) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'Give a vault and an action, or a plan.' });
  }
  if (input.as === undefined) throw new AtropyleError('INVALID_OPTIONS', { message: 'Say who acts with `as`.' });
  if (input.drill !== undefined)
    throw new AtropyleError('INVALID_OPTIONS', { message: '`drill` applies to plan mode only.' });
  const vault = toAddress(input.vault, 'vault');
  const as = toAddress(input.as, 'as');
  // Check the shape of `at` before any RPC; only a relative `+3d` needs the latest block.
  if (input.at !== undefined) parseAt(input.at, 0n);
  const at = input.at === undefined ? undefined : parseAt(input.at, await latestTimestamp(atro));
  const r = await atro.vault(vault).whatIf(input.action, at === undefined ? { as } : { as, at });
  return finish(SimulateOutputSchema, {
    mode: 'action',
    vault,
    as,
    action: r.action,
    at: r.effect?.at ?? at ?? null,
    effect: r.effect,
    simulation: r.simulation,
    timeline: null,
    config: null,
    summary: whatIfSummary(r),
    warnings: [],
  });
}

function checkSummary(c: PlanCheck): string {
  if (!c.ok) {
    const shown = c.issues.slice(0, 5).map((i) => `${i.path} ${i.code}`);
    const more = c.issues.length > 5 ? ` and ${c.issues.length - 5} more` : '';
    return `The plan has ${plural(c.issues.length, 'issue')}: ${shown.join(', ')}${more}.`;
  }
  const p = c.config as PlanConfig;
  const fees = c.fees.tokens.map((f) => `${formatUnits(f.fee, f.decimals ?? 0)} of token ${f.token}`).join(', or ');
  return [
    `The plan is valid: ${plural(p.heirs.length, 'heir')}, ${plural(p.guardians.length, 'guardian')} (k = ${p.k}),`,
    `check-in every ${formatDuration(p.timing.period)}, alarm after ${plural(p.timing.threshold, 'missed period')},`,
    `${formatDuration(p.timing.window)} to cancel, ${plural(p.assets.length, 'asset')}.`,
    fees ? `Creation fee now: ${fees}.` : '',
    c.warnings.length > 0 ? `Read ${plural(c.warnings.length, 'warning')} before signing.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export async function checkPlan(atro: AtropyleClient, input: CheckPlanInput): Promise<CheckPlanOutput> {
  const owner = planOwner(input.plan, input.owner);
  const check = await atro.checkPlan(input.plan, input.drill === undefined ? { owner } : { owner, drill: input.drill });
  return finish(CheckPlanOutputSchema, {
    ok: check.ok,
    owner,
    issues: check.issues,
    config: check.config,
    tokens: check.tokens,
    fees: check.fees,
    contractHeirs: check.contractHeirs,
    summary: checkSummary(check),
    warnings: check.warnings,
  });
}
