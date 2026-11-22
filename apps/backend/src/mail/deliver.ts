import { sha256Hex, unsubToken } from '../crypto';
import type { Deps } from '../deps';
import { composeEmail, type Facts } from '../email/compose';
import type { EmailKind } from '../email/kinds';
import { errorText } from '../log';
import { claimDelivery, completeDelivery, type DeliveryKey, releaseDelivery } from '../store/deliveries';
import type { Subscriber } from '../store/subscriptions';
import { MailError } from './mailer';

export interface Outbound {
  sub: Subscriber;
  kind: EmailKind;
  /** What makes this email unique for the subscriber: a check-in block, a tx hash, 'once', 'expired'. */
  periodKey: string;
  facts?: Facts;
  /** The confirm email only. */
  confirmToken?: string;
}

/** Counters of one run, and the circuit breaker: once stopped, nothing more is sent in this run. */
export interface DeliveryRun {
  sent: number;
  skipped: number;
  failed: number;
  stopped: boolean;
}

export const newRun = (): DeliveryRun => ({ sent: 0, skipped: 0, failed: 0, stopped: false });
export const MAX_FAILURES = 3;
export type DeliverResult = 'sent' | 'skipped' | 'failed';

/**
 * Claim, compose, send, complete. On failure the claim is released and the caller retries next tick. If the send
 * succeeded but completing failed, the claim goes stale after CLAIM_STALE_MS and the retry carries the same Resend
 * Idempotency-Key, so the reader still gets one email. The log never carries the address.
 */
export async function deliver(d: Deps, o: Outbound, run: DeliveryRun = newRun()): Promise<DeliverResult> {
  // The breaker is open: nothing is claimed or sent, and the caller keeps the event for the next run.
  if (run.stopped) return 'failed';
  const key: DeliveryKey = { subscriptionId: o.sub.id, kind: o.kind, periodKey: o.periodKey };
  if (!(await claimDelivery(d.sql, key, d.clock.now()))) {
    run.skipped++;
    return 'skipped';
  }
  try {
    const mail = composeEmail(d.config, {
      kind: o.kind,
      lang: o.sub.lang,
      to: o.sub.email,
      vault: o.sub.vault,
      role: o.sub.role,
      unsubToken: await unsubToken(d.config.tokenSecret, o.sub.id),
      confirmToken: o.confirmToken,
      facts: o.facts,
      idempotencyKey: await sha256Hex(`${o.sub.id}:${o.kind}:${o.periodKey}`),
    });
    const { id } = await d.mailer.send(mail);
    await completeDelivery(d.sql, key, id, d.clock.now());
    run.sent++;
    return 'sent';
  } catch (e) {
    await releaseDelivery(d.sql, key).catch(() => undefined);
    run.failed++;
    if (run.failed >= MAX_FAILURES || (e instanceof MailError && e.status === 429)) run.stopped = true;
    d.log.warn('email not sent', { kind: o.kind, subscription: o.sub.id, error: errorText(e) });
    return 'failed';
  }
}
