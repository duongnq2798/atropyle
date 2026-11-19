import type { Address, Hex, WalletClient } from 'viem';
import { sameAddress, toAddress, ZERO_ADDRESS } from './address';
import type { AtropyleClient } from './client';
import { AtropyleError, type AtropyleErrorJson, decodeError } from './errors';
import { type Timeline, timelineOf } from './policy/timeline';
import type { VaultStatus } from './read/types';
import { isReleasedState } from './types';

export type KeeperAction = 'poke' | 'distribute';
export type KeeperReason =
  | 'EXPIRED'
  | 'RELEASE_DUE'
  | 'TRANSITION_DUE'
  | 'DISTRIBUTE_DUE'
  | 'DISTRIBUTE_BACKOFF'
  | 'DONE'
  | 'WAITING';

export interface KeeperDecision {
  vault: Address;
  action: KeeperAction | null;
  reason: KeeperReason;
  /** Chain time at which to look at this vault again; null when it never needs another look. */
  nextCheckAt: bigint | null;
}

export interface KeeperPlanOptions {
  /** Chain time of the last distribute this keeper sent to the vault. */
  lastDistributeAt?: bigint | null;
  /** Gap between two distribute calls while coverage stays above zero. Default 3600 s. */
  distributeEvery?: bigint;
}

export const DISTRIBUTE_EVERY = 3600n;
export const RECHECK_RELEASED = 86_400n;
/**
 * Seconds until a vault is looked at again after a failed simulation, a failed send, a failed read or a gas-cap skip.
 * A vault that never fits under the gas cap is therefore re-estimated every 300 s: one estimateGas per check and no
 * transaction. How often keeperTick runs, and so how often that happens, is up to the caller (the Worker's cron).
 */
export const RETRY_AFTER = 300n;

/** Spec §9.4: the keeper's whole policy as a pure function of one snapshot. */
export function planKeeperActions(
  status: VaultStatus,
  timeline: Timeline,
  now: bigint,
  o: KeeperPlanOptions = {},
): KeeperDecision {
  const vault = status.vault;
  const every = o.distributeEvery ?? DISTRIBUTE_EVERY;
  const covered = status.assets.some((a) => a.coverage > 0n);
  if (status.expired) return { vault, action: null, reason: 'EXPIRED', nextCheckAt: null };
  if (isReleasedState(status.state)) {
    if (!covered) return { vault, action: null, reason: 'DONE', nextCheckAt: now + RECHECK_RELEASED };
    const last = o.lastDistributeAt ?? null;
    if (last !== null && now < last + every) {
      return { vault, action: null, reason: 'DISTRIBUTE_BACKOFF', nextCheckAt: last + every };
    }
    return { vault, action: 'distribute', reason: 'DISTRIBUTE_DUE', nextCheckAt: now + every };
  }
  if (isReleasedState(status.pending)) {
    // distribute() advances the policy first, so one transaction both releases and pays out.
    return { vault, action: covered ? 'distribute' : 'poke', reason: 'RELEASE_DUE', nextCheckAt: now };
  }
  if (status.pending !== status.state) return { vault, action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: now };
  const next = timeline.nextCheckAt ?? status.expiresAt;
  return { vault, action: null, reason: 'WAITING', nextCheckAt: next === null ? null : next > now ? next : now + 1n };
}

export type KeeperOutcomeStatus =
  | 'idle'
  | 'dry-run'
  | 'sent'
  | 'simulation-failed'
  | 'gas-cap'
  | 'send-failed'
  | 'limit'
  | 'read-failed'
  | 'owner-wallet';

export interface KeeperOutcome {
  vault: Address;
  decision: KeeperDecision | null;
  status: KeeperOutcomeStatus;
  hash?: Hex;
  error?: AtropyleErrorJson;
  nextCheckAt: bigint | null;
}

export interface KeeperReport {
  /** Chain time of the latest block when the tick started. */
  ranAt: bigint;
  dryRun: boolean;
  keeper: Address | null;
  balance: bigint | null;
  stopped: 'LOW_BALANCE' | null;
  sent: number;
  outcomes: KeeperOutcome[];
}

export interface KeeperOptions {
  /**
   * Signs poke/distribute. Without it the tick is a dry run: decisions and simulations, nothing sent.
   * It must not be the owner's wallet: before release an owner-signed poke or distribute is a check-in, which would
   * keep the vault alive for ever. A vault whose owner is this wallet gets status `owner-wallet` (error
   * WRONG_ACCOUNT) and nothing is sent; a released vault is fine, since nothing is left to check in.
   */
  wallet?: WalletClient;
  /** Attempts per tick (default 20): a vault simulated or sent counts, whatever the result, so skips use the budget too. */
  maxTx?: number;
  /**
   * Cap on the estimated gas of one transaction (default 4,000,000): a simulation above it is skipped (`gas-cap`).
   * It caps the estimate, not the gas limit that is sent: send() still multiplies the estimate by its 1.3 gasBuffer,
   * so a transaction that passes can carry a gas limit of up to 1.3 × maxGas.
   */
  maxGas?: bigint;
  /** Stop entirely below this native balance (default 0.005 OKB). */
  minBalance?: bigint;
  distributeEvery?: bigint;
  lastDistributeAt?: (vault: Address) => bigint | null | undefined;
}

export const KEEPER_DEFAULTS = { maxTx: 20, maxGas: 4_000_000n, minBalance: 5_000_000_000_000_000n } as const;

/**
 * One keeper run over vaults that are due (spec §9.4). Vaults are handled one by one so nonces never clash.
 * poke and distribute are permissionless and only pay heirs or the recovery wallet, so a stolen keeper key
 * can burn gas but cannot move assets.
 *
 * Every per-vault failure (a read, a simulation, a send, a receipt) becomes an outcome with the decoded error, RPC
 * failures included, so the sent hashes and the next-check times already collected are never lost; the vault is looked
 * at again in RETRY_AFTER seconds. A receipt that cannot be read after the broadcast is `send-failed` with the hash in
 * `error.details.hash`. Only the failures before the first vault (the latest block, the keeper balance, invalid
 * options) throw, as an AtropyleError. A vault listed twice is handled once; an address that is not valid is a
 * `read-failed` outcome that never comes back.
 */
export async function keeperTick(
  atro: AtropyleClient,
  vaults: readonly Address[],
  o: KeeperOptions = {},
): Promise<KeeperReport> {
  try {
    return await runTick(atro, vaults, o);
  } catch (e) {
    throw decodeError(e);
  }
}

function checkOptions(o: KeeperOptions): void {
  const bad = (path: string, rule: string, value: unknown) =>
    new AtropyleError('INVALID_OPTIONS', {
      message: `${path} must be ${rule}, got ${String(value)}.`,
      details: { path },
    });
  if (o.maxTx !== undefined && !(Number.isSafeInteger(o.maxTx) && o.maxTx >= 0)) {
    throw bad('maxTx', 'a whole number of at least 0', o.maxTx);
  }
  if (o.maxGas !== undefined && !(typeof o.maxGas === 'bigint' && o.maxGas > 0n)) {
    throw bad('maxGas', 'a bigint above 0', o.maxGas);
  }
  if (o.minBalance !== undefined && !(typeof o.minBalance === 'bigint' && o.minBalance >= 0n)) {
    throw bad('minBalance', 'a bigint of at least 0', o.minBalance);
  }
  if (o.distributeEvery !== undefined && !(typeof o.distributeEvery === 'bigint' && o.distributeEvery > 0n)) {
    throw bad('distributeEvery', 'a bigint above 0', o.distributeEvery);
  }
}

async function runTick(atro: AtropyleClient, vaults: readonly Address[], o: KeeperOptions): Promise<KeeperReport> {
  checkOptions(o);
  const maxTx = o.maxTx ?? KEEPER_DEFAULTS.maxTx;
  const maxGas = o.maxGas ?? KEEPER_DEFAULTS.maxGas;
  const minBalance = o.minBalance ?? KEEPER_DEFAULTS.minBalance;
  const wallet = o.wallet ?? null;
  const keeper = wallet ? (wallet.account?.address ?? (await wallet.getAddresses())[0] ?? null) : null;
  if (wallet && !keeper) throw new AtropyleError('WRONG_ACCOUNT', { message: 'The keeper wallet has no account.' });
  const block = await atro.publicClient.getBlock();
  const report: KeeperReport = {
    ranAt: block.timestamp,
    dryRun: !wallet,
    keeper,
    balance: null,
    stopped: null,
    sent: 0,
    outcomes: [],
  };
  if (keeper) {
    report.balance = await atro.publicClient.getBalance({ address: keeper });
    if (report.balance < minBalance) {
      report.stopped = 'LOW_BALANCE';
      return report;
    }
  }
  const retry = report.ranAt + RETRY_AFTER;
  let attempts = 0;
  const seen = new Set<Address>();
  for (const input of vaults) {
    let vault = input;
    let decision: KeeperDecision;
    let owner: Address;
    let released: boolean;
    try {
      vault = toAddress(input, 'vault');
      if (seen.has(vault)) continue;
      seen.add(vault);
      const snap = await atro.vault(vault).snapshot();
      const engine = await atro.engineFor(snap.binding.cpu, snap.binding.policyId);
      const now = snap.status.blockTimestamp;
      owner = snap.config.owner;
      released = isReleasedState(snap.status.state);
      decision = planKeeperActions(snap.status, timelineOf(engine, snap, now), now, {
        distributeEvery: o.distributeEvery,
        lastDistributeAt: o.lastDistributeAt?.(vault) ?? null,
      });
    } catch (e) {
      const err = decodeError(e);
      const permanent = err.code === 'NOT_VAULT' || err.code === 'INVALID_ADDRESS';
      const nextCheckAt = permanent ? null : retry;
      report.outcomes.push({ vault, decision: null, status: 'read-failed', error: err.toJSON(), nextCheckAt });
      continue;
    }
    if (decision.action === null) {
      report.outcomes.push({ vault, decision, status: 'idle', nextCheckAt: decision.nextCheckAt });
      continue;
    }
    if (keeper && sameAddress(keeper, owner) && !released) {
      // Before release an owner-signed poke or distribute is a check-in: sending it would reset the vault's clock.
      const error = new AtropyleError('WRONG_ACCOUNT', {
        message: `The keeper wallet ${keeper} owns this vault; its poke or distribute would check the owner in.`,
        hint: 'Run the keeper with a wallet that is not the vault owner.',
      }).toJSON();
      report.outcomes.push({ vault, decision, status: 'owner-wallet', error, nextCheckAt: decision.nextCheckAt });
      continue;
    }
    if (attempts >= maxTx) {
      report.outcomes.push({ vault, decision, status: 'limit', nextCheckAt: decision.nextCheckAt });
      continue;
    }
    attempts++;
    try {
      const plan = await atro.vault(vault).prepare({ type: decision.action }, { as: keeper ?? ZERO_ADDRESS });
      const sim = plan.steps[0].simulation;
      if (sim.ok === false) {
        const nextCheckAt = sim.error.code === 'DRILL_EXPIRED' ? null : retry;
        report.outcomes.push({ vault, decision, status: 'simulation-failed', error: sim.error, nextCheckAt });
        continue;
      }
      if (plan.warnings.some((w) => w.code === 'NO_EFFECT')) {
        // Someone else advanced the vault between the decision and prepare's own read: a poke now would do nothing.
        report.outcomes.push({ vault, decision, status: 'idle', nextCheckAt: decision.nextCheckAt });
        continue;
      }
      if (sim.ok === true && sim.gas > maxGas) {
        // Looked at again in RETRY_AFTER seconds, like every other failure: see RETRY_AFTER.
        report.outcomes.push({ vault, decision, status: 'gas-cap', nextCheckAt: retry });
        continue;
      }
      if (!wallet) {
        report.outcomes.push({ vault, decision, status: 'dry-run', nextCheckAt: decision.nextCheckAt });
        continue;
      }
      const sent = await atro.send(plan, wallet);
      report.sent++;
      report.outcomes.push({
        vault,
        decision,
        status: 'sent',
        hash: sent.steps[0].hash,
        nextCheckAt: decision.nextCheckAt,
      });
    } catch (e) {
      report.outcomes.push({
        vault,
        decision,
        status: 'send-failed',
        error: decodeError(e).toJSON(),
        nextCheckAt: retry,
      });
    }
  }
  return report;
}
