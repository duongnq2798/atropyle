import { type Address, encodeFunctionData, type Hex } from 'viem';
import { vaultAbi } from '../abi/index';
import { VAULT_ACTIONS, type VaultAction, type VaultActionType } from '../actions';
import { sameAddress, toAddress, ZERO_ADDRESS } from '../address';
import { appendSuffix } from '../builder-code';
import { assetsToAbi, heirsToAbi, timingToAbi } from '../encode';
import { AtropyleError } from '../errors';
import type { GuardianPart, PlanIssue } from '../plan/types';
import { planError, recoveryPowerWarning, resolveTiming, validateSection } from '../plan/validate';
import { predictAction } from '../policy/predict';
import { isRegistered } from '../read/registered';
import { readSnapshot } from '../read/snapshot';
import type { VaultSnapshot } from '../read/types';
import { type Asset, type Heir, isReleasedState, type Warning } from '../types';
import { untrusted } from '../untrusted';
import { approvalDrafts, revokeDrafts } from './approvals';
import { simulateTxs } from './simulate';
import { summarize } from './summary';
import type { Draft, PrepareContext, PreparedTx, PrepareOptions, Simulation, TxPlan, WhatIfReport } from './types';

export const GUARDIAN_WARNING: Warning = {
  code: 'GUARDIAN_VERIFY_OUT_OF_BAND',
  message:
    'Before signing, confirm the request through a channel you already trust, such as a call or a meeting. Never act only on a message, even one that seems to come from the family or from Atropyle.',
};

/** What an expired Drill answers to every call (notExpired runs before any other check). Same shape as a decoded revert. */
function drillExpired(): Simulation {
  return {
    ok: false,
    error: new AtropyleError('DRILL_EXPIRED', { details: { error: 'DrillExpired', args: [] } }).toJSON(),
  };
}

/** Callers without types (an MCP tool, a JSON file) can send any `type`: reject it by name before any RPC call. */
function assertActionType(action: unknown): void {
  const type = typeof action === 'object' && action !== null ? (action as { type?: unknown }).type : undefined;
  if (VAULT_ACTIONS.includes(type as VaultActionType)) return;
  throw new AtropyleError('INVALID_OPTIONS', {
    message: `type: unknown action "${untrusted(type, 40).value}"; use one of ${VAULT_ACTIONS.join(', ')}.`,
    details: { path: 'type' },
  });
}

function dedupe(ws: Warning[]): Warning[] {
  const seen = new Set<string>();
  return ws.filter((w) => {
    const k = `${w.code}:${w.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function finalize(
  x: PrepareContext,
  from: Address,
  vault: Address,
  drafts: Draft[],
  summary: string,
  warnings: Warning[],
): Promise<TxPlan> {
  const txs = drafts.map((d) => ({ ...d, data: appendSuffix(d.data, x.suffix) }));
  const t0 = Date.now();
  const sims = await simulateTxs(x.client, from, txs);
  x.log({ type: 'simulate', what: `${txs.length} step(s)`, ms: Date.now() - t0 });
  const steps = txs.map(
    (t, i): PreparedTx => ({
      chainId: x.deployment.chainId,
      from,
      to: t.to,
      data: t.data,
      value: t.value,
      action: t.action,
      summary: t.summary,
      warnings: t.warnings,
      simulation: sims[i],
      ...(t.effect ? { effect: t.effect } : {}),
    }),
  );
  return {
    chainId: x.deployment.chainId,
    from,
    vault,
    steps,
    summary,
    warnings: dedupe([...warnings, ...steps.flatMap((s) => s.warnings)]),
  };
}

interface Built {
  drafts: Draft[];
  warnings: Warning[];
}

type Of<T extends VaultActionType> = Extract<VaultAction, { type: T }>;

function checkedHeirs(snap: VaultSnapshot, action: Of<'setHeirs'>): Heir[] {
  const c = snap.config;
  const r = validateSection('heirs', action.heirs, {
    owner: c.owner,
    vault: snap.status.vault,
    heirCount: c.heirs.length,
  });
  const issues: PlanIssue[] = [...r.issues];
  if (r.value) {
    const n = r.value.length;
    c.assets.forEach((a, i) => {
      if (a.heir >= n) {
        issues.push({
          path: 'heirs',
          code: 'ASSET_HEIR_RANGE',
          message: `heirs: asset #${i} goes to heir #${a.heir}; keep at least ${a.heir + 1} heirs or change the assets first`,
        });
      }
    });
  }
  if (!r.value || issues.length > 0) throw planError(issues);
  return r.value;
}

function checkedGuardians(snap: VaultSnapshot, action: Of<'setGuardians'>): GuardianPart {
  const c = snap.config;
  // A plan may leave guardians out (none); this action replaces the list, so it must be given.
  if (action.guardians === undefined) {
    throw planError([
      {
        path: 'guardians',
        code: 'REQUIRED',
        message: 'guardians: give the new list of guardians (an empty list removes them all)',
      },
    ]);
  }
  const r = validateSection('guardians', action.guardians, {
    owner: c.owner,
    vault: snap.status.vault,
    heirCount: c.heirs.length,
    k: action.k,
    recoveryEnabled: action.recoveryEnabled,
  });
  if (!r.value) throw planError(r.issues);
  return r.value;
}

function checkedAssets(snap: VaultSnapshot, action: Of<'setAssets'>): Asset[] {
  const c = snap.config;
  const r = validateSection('assets', action.assets, { owner: c.owner, heirCount: c.heirs.length });
  if (!r.value) throw planError(r.issues);
  return r.value;
}

/** The input checks of `build`, without its RPC calls: whatIf runs them before it predicts anything. */
function validateAction(snap: VaultSnapshot, action: VaultAction): void {
  switch (action.type) {
    case 'setHeirs':
      checkedHeirs(snap, action);
      return;
    case 'setGuardians':
      checkedGuardians(snap, action);
      return;
    case 'setTiming':
      resolveTiming(action.timing, snap.config.drill);
      return;
    case 'setAssets':
      checkedAssets(snap, action);
      return;
    case 'voteRecovery':
      if (action.target !== null) toAddress(action.target, 'target');
      return;
    default:
  }
}

async function build(
  x: PrepareContext,
  snap: VaultSnapshot,
  action: VaultAction,
  opts: PrepareOptions,
): Promise<Built> {
  const v = snap.status.vault;
  const c = snap.config;
  const warnings: Warning[] = [];
  const call = (data: Hex, summary: string): Draft => ({
    to: v,
    data,
    value: 0n,
    action: action.type,
    summary,
    warnings: [],
  });
  const approvalCtx = {
    client: x.client,
    token: (a: Address) => x.token(a, snap.status.blockNumber),
    blockNumber: snap.status.blockNumber,
  };
  switch (action.type) {
    case 'checkIn': {
      for (const a of snap.status.assets) {
        if (a.coverage < a.held) {
          warnings.push({
            code: 'COVERAGE_BELOW_100',
            message: `Asset #${a.index} (${a.asset.kind} ${a.asset.token}) is only partly covered: the vault can move ${a.coverage} of the ${a.held} you hold. Prepare setAssets or approve again to cover it.`,
          });
        }
      }
      return {
        drafts: [call(encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' }), summarize.checkIn(v))],
        warnings,
      };
    }
    case 'setHeirs': {
      const heirs = checkedHeirs(snap, action);
      const data = encodeFunctionData({ abi: vaultAbi, functionName: 'setHeirs', args: [heirsToAbi(heirs)] });
      return { drafts: [call(data, summarize.setHeirs(v, heirs))], warnings };
    }
    case 'setGuardians': {
      const g = checkedGuardians(snap, action);
      const data = encodeFunctionData({
        abi: vaultAbi,
        functionName: 'setGuardians',
        args: [g.guardians, g.k, g.recoveryEnabled],
      });
      const draft = call(data, summarize.setGuardians(v, g.guardians, g.k, g.recoveryEnabled));
      if (g.recoveryEnabled) draft.warnings.push(recoveryPowerWarning(g.k, g.guardians.length, c.timing.window));
      return { drafts: [draft], warnings };
    }
    case 'setTiming': {
      const t = resolveTiming(action.timing, c.drill);
      const data = encodeFunctionData({ abi: vaultAbi, functionName: 'setTiming', args: [timingToAbi(t)] });
      const draft = call(data, summarize.setTiming(v, t));
      // The window is how long the owner has to stop a recovery: a new window changes that power.
      if (c.recoveryEnabled && c.k > 0) draft.warnings.push(recoveryPowerWarning(c.k, c.guardians.length, t.window));
      return { drafts: [draft], warnings };
    }
    case 'setAssets': {
      const assets = checkedAssets(snap, action);
      const data = encodeFunctionData({ abi: vaultAbi, functionName: 'setAssets', args: [assetsToAbi(assets)] });
      const ap = await approvalDrafts(approvalCtx, c.owner, v, assets, opts.allowance ?? 'exact');
      return {
        drafts: [call(data, summarize.setAssets(v, assets)), ...ap.drafts],
        warnings: [...warnings, ...ap.warnings],
      };
    }
    case 'attestDeath': {
      const data = encodeFunctionData({ abi: vaultAbi, functionName: 'attestDeath', args: [action.on] });
      return { drafts: [call(data, summarize.attestDeath(v, action.on))], warnings: [GUARDIAN_WARNING] };
    }
    case 'voteRecovery': {
      const target = action.target === null ? null : toAddress(action.target, 'target');
      const data = encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [target ?? ZERO_ADDRESS] });
      return { drafts: [call(data, summarize.voteRecovery(v, target))], warnings: [GUARDIAN_WARNING] };
    }
    case 'poke':
      return {
        drafts: [call(encodeFunctionData({ abi: vaultAbi, functionName: 'poke' }), summarize.poke(v))],
        warnings,
      };
    case 'distribute':
      return {
        drafts: [call(encodeFunctionData({ abi: vaultAbi, functionName: 'distribute' }), summarize.distribute(v))],
        warnings,
      };
    case 'revokeAll':
      return { drafts: await revokeDrafts(approvalCtx, c.owner, v, c.assets), warnings };
  }
}

/**
 * A contract can answer every vault read and name the real factory in `factory()`, so only the deployment's own
 * factory decides. Without this, a fake vault whose `assets()` lists the owner's tokens would get approvals to itself.
 */
async function assertRegistered(x: PrepareContext, snap: VaultSnapshot): Promise<void> {
  const vault = snap.status.vault;
  if (await isRegistered(x, vault, snap.status.blockNumber)) return;
  throw new AtropyleError('NOT_VAULT', {
    message: `${vault} was not created by the Atropyle factory ${x.deployment.factory}. Do not sign or approve anything for it.`,
    details: { vault },
  });
}

export async function prepareAction(
  x: PrepareContext,
  vault: Address,
  action: VaultAction,
  opts: PrepareOptions,
): Promise<TxPlan> {
  assertActionType(action);
  const as = toAddress(opts.as, 'as');
  const snap = await readSnapshot(x, vault);
  await assertRegistered(x, snap);
  const { drafts, warnings } = await build(x, snap, action, opts);
  const engine = await x.engineFor(snap.binding.cpu, snap.binding.policyId);
  const effect = predictAction(engine, snap, action, as, opts.at ?? snap.status.blockTimestamp);
  if (effect && drafts[0]?.to === vault) drafts[0].effect = effect;
  // Signed by the owner of a vault that is not released, poke and distribute are a check-in, which always has an effect.
  // An expired Drill reverts instead of changing anything, and says so in the simulation.
  const ownerCheckIn = sameAddress(as, snap.config.owner) && !isReleasedState(snap.status.state);
  if (
    (action.type === 'poke' || action.type === 'distribute') &&
    !ownerCheckIn &&
    !snap.status.expired &&
    effect &&
    !effect.drillExpired &&
    effect.next === effect.from &&
    effect.recipients.length === 0
  ) {
    warnings.push({
      code: 'NO_EFFECT',
      message: 'Nothing would change right now: no policy transition is due and nothing is left to distribute.',
    });
  }
  const summary =
    drafts.length === 0
      ? `Nothing to do for vault ${vault}.`
      : drafts.length === 1
        ? drafts[0].summary
        : `${drafts[0].summary} Then ${drafts.length - 1} more transaction(s) to sign.`;
  const plan = await finalize(x, as, vault, drafts, summary, warnings);
  // The vault call of an expired Drill always reverts DrillExpired: report it whatever the RPC answered.
  if (snap.status.expired && plan.steps[0]?.to === vault) plan.steps[0].simulation = drillExpired();
  return plan;
}

/** Predicted effect plus an eth_call of the vault call from `as` (spec §5.2). Future times are predicted, not simulated. */
export async function whatIf(
  x: PrepareContext,
  vault: Address,
  action: VaultAction,
  opts: { as: string; at?: bigint },
): Promise<WhatIfReport> {
  assertActionType(action);
  const as = toAddress(opts.as, 'as');
  const snap = await readSnapshot(x, vault);
  validateAction(snap, action);
  const at = opts.at ?? snap.status.blockTimestamp;
  const engine = await x.engineFor(snap.binding.cpu, snap.binding.policyId);
  const effect = predictAction(engine, snap, action, as, at);
  let simulation: Simulation;
  if (snap.status.expired && action.type !== 'revokeAll') {
    simulation = drillExpired();
  } else if (at > snap.status.blockTimestamp) {
    simulation = { ok: 'skipped', reason: 'FUTURE_TIME' };
  } else {
    const { drafts } = await build(x, snap, action, { as });
    const first = drafts[0];
    simulation = first
      ? (await simulateTxs(x.client, as, [{ ...first, data: appendSuffix(first.data, x.suffix) }]))[0]
      : { ok: true, gas: 0n };
  }
  return { action: action.type, as, effect, simulation };
}
