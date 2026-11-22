import { STATE_CODES } from '@atropyle/sdk';
import { type Address, formatUnits, getAddress, isAddress, zeroAddress } from 'viem';
import type { StoredAsset } from '../chain/port';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import type { Facts } from '../email/compose';
import type { Transfer } from '../email/format';
import type { EmailKind } from '../email/kinds';
import { type DeliveryRun, deliver, newRun } from '../mail/deliver';
import {
  drillSummaryRows,
  eventsOfTx,
  markNotified,
  reminderRows,
  type StoredEvent,
  unnotifiedEvents,
} from '../store/notices';
import { activeSubscribers, type Subscriber } from '../store/subscriptions';
import { getVault, type VaultRow } from '../store/vaults';
import type { Role } from '../types';

/** Events older than this in chain time are marked without an email (plan ruling 9: no backlog after an outage). */
export const MAX_NOTICE_AGE = 86_400n;

export type ReminderKind = 'checkin-50' | 'checkin-80' | 'checkin-due';

/** The highest check-in reminder due at `now` for a cycle that started at lastAlive and runs late at lateAt. */
export function dueReminder(lastAlive: bigint, lateAt: bigint, now: bigint): ReminderKind | null {
  const span = lateAt - lastAlive;
  if (span <= 0n) return null;
  const elapsed = now - lastAlive;
  if (elapsed >= span) return 'checkin-due';
  if (elapsed * 10n >= span * 8n) return 'checkin-80';
  if (elapsed * 2n >= span) return 'checkin-50';
  return null;
}

export interface PlannedNotice {
  role: Role;
  kind: EmailKind;
  periodKey: string;
  facts: Facts;
}

/** A payout line from a Distributed event and the vault's stored assets. amountOrId: amount, ERC-721 id or count. */
export function transferOf(assets: readonly StoredAsset[], e: StoredEvent): Transfer {
  const index = Number(e.args.assetIndex);
  const to = getAddress(String(e.args.to));
  const raw = BigInt(String(e.args.amountOrId));
  const asset = assets.find((a) => a.index === index);
  if (!asset) return { kind: 'unknown', token: null, to, amount: raw.toString(), id: String(index) };
  if (asset.kind === 'erc20') {
    const amount = asset.decimals === null ? raw.toString() : formatUnits(raw, asset.decimals);
    return { kind: 'erc20', token: asset.token, to, amount, id: null };
  }
  if (asset.kind === 'erc721') return { kind: 'erc721', token: asset.token, to, amount: null, id: raw.toString() };
  return { kind: 'erc1155', token: asset.token, to, amount: raw.toString(), id: asset.id };
}

const addressArg = (v: unknown): Address | null => {
  const s = String(v ?? '');
  return isAddress(s, { strict: false }) && s.toLowerCase() !== zeroAddress ? getAddress(s) : null;
};

/** Pure routing of one event to (role, email) pairs; `group` holds every Distributed event of the same transaction. */
export function planEventNotices(
  e: StoredEvent,
  vault: VaultRow | null,
  group: readonly StoredEvent[],
): PlannedNotice[] {
  const per = `${e.txHash}:${e.logIndex}`;
  if (e.name === 'AlarmRaised') {
    if (!vault || vault.windowEndsAt === null || (vault.state !== 'grace' && vault.state !== 'recovery')) return [];
    const alarm = Number(e.args.state) === STATE_CODES.recovery ? 'recovery' : 'inheritance';
    const facts: Facts = { deadline: vault.windowEndsAt, alarm };
    const out: PlannedNotice[] = [
      { role: 'owner', kind: 'alarm-owner', periodKey: per, facts },
      { role: 'guardian', kind: 'alarm-guardian', periodKey: per, facts },
    ];
    if (alarm === 'inheritance') out.push({ role: 'heir', kind: 'alarm-heir', periodKey: per, facts });
    return out;
  }
  if (e.name === 'RecoveryVoted') {
    const target = addressArg(e.args.target);
    const guardian = addressArg(e.args.guardian);
    if (!target || !guardian) return [];
    return [{ role: 'owner', kind: 'recovery-vote', periodKey: per, facts: { guardian, target } }];
  }
  if (e.name === 'Released') {
    const recovery = Number(e.args.state) === STATE_CODES.releasedRecover;
    const facts: Facts = { tx: e.txHash, released: recovery ? 'recovery' : 'inheritance' };
    const roles: Role[] = recovery ? ['owner', 'guardian'] : ['heir', 'guardian'];
    return roles.map((role) => ({ role, kind: 'released', periodKey: e.txHash, facts }));
  }
  if (e.name === 'Distributed') {
    if (!vault) return [];
    const transfers = group.filter((g) => g.name === 'Distributed').map((g) => transferOf(vault.assets, g));
    const role: Role = vault.state === 'releasedRecover' ? 'owner' : 'heir';
    return [{ role, kind: 'distributed', periodKey: e.txHash, facts: { tx: e.txHash, transfers } }];
  }
  return [];
}

export interface NoticeResult extends DeliveryRun {
  /** Events handled (mailed, skipped as too old, or needing no email) and marked notified. */
  events: number;
  reminders: number;
  summaries: number;
}

/**
 * Spec §9.3.2. Event alerts first, in log order; then, only when the indexer has caught up (the stored views are
 * current), reminders and Drill summaries. Stops at the deadline or when the delivery circuit breaker opens.
 */
export async function runNotices(d: Deps, now: bigint, deadlineMs: number, caughtUp: boolean): Promise<NoticeResult> {
  const run = newRun();
  const res = { events: 0, reminders: 0, summaries: 0 };
  const open = () => !run.stopped && d.clock.now() < deadlineMs;
  const vaults = new Map<string, VaultRow | null>();
  const subs = new Map<string, Subscriber[]>();
  const vaultOf = async (a: Address) => {
    if (!vaults.has(a)) vaults.set(a, await getVault(d.sql, a));
    return vaults.get(a) ?? null;
  };
  const subsOf = async (a: Address) => {
    if (!subs.has(a)) subs.set(a, await activeSubscribers(d.sql, a));
    return subs.get(a) ?? [];
  };

  const handled = new Set<string>();
  for (const e of await unnotifiedEvents(d.sql)) {
    if (!open()) break;
    if (handled.has(`${e.txHash}:${e.logIndex}`)) continue;
    const group = e.name === 'Distributed' ? await eventsOfTx(d.sql, e.vault, e.txHash, 'Distributed') : [e];
    for (const g of group) handled.add(`${g.txHash}:${g.logIndex}`);
    let complete = true;
    if (now - e.at <= MAX_NOTICE_AGE) {
      const notices = planEventNotices(e, await vaultOf(e.vault), group);
      const readers = notices.length > 0 ? await subsOf(e.vault) : [];
      for (const n of notices) {
        for (const sub of readers.filter((s) => s.role === n.role)) {
          const r = await deliver(d, { sub, kind: n.kind, periodKey: n.periodKey, facts: n.facts }, run);
          if (r === 'failed') complete = false;
        }
      }
    }
    if (!complete) continue;
    await markNotified(d.sql, group, isoAt(d.clock.now()));
    res.events += group.length;
  }

  if (caughtUp) {
    for (const r of await reminderRows(d.sql, now)) {
      if (!open()) break;
      const kind = dueReminder(r.lastAlive, r.lateAt, now);
      if (kind === null || r.sent.includes(kind)) continue;
      res.reminders++;
      await deliver(d, { sub: r.sub, kind, periodKey: r.periodKey, facts: { deadline: r.lateAt } }, run);
    }
    for (const s of await drillSummaryRows(d.sql, now)) {
      if (!open()) break;
      res.summaries++;
      const facts: Facts = { checkIns: s.checkIns, alarms: s.alarms, released: s.released };
      await deliver(d, { sub: s.sub, kind: 'drill-summary', periodKey: 'expired', facts }, run);
    }
  }
  return { ...run, ...res };
}
