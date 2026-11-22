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
  /** Already sent before. */
  skipped: number;
  /** Claimed by another run and not sent yet. */
  busy: number;
  failed: number;
  stopped: boolean;
}

export const newRun = (): DeliveryRun => ({ sent: 0, skipped: 0, busy: 0, failed: 0, stopped: false });
export const MAX_FAILURES = 3;
/** Only 'sent' and 'skipped' mean the reader has the email; a caller keeps its event open on 'busy' and 'failed'. */
export type DeliverResult = 'sent' | 'skipped' | 'busy' | 'failed';

/**
 * Claim, compose, send, complete.
 * - 'sent': this call sent the email. 'skipped': it was already sent.
 * - 'busy': another run holds a claim younger than CLAIM_STALE_MS. That run may still be sending, or it died between
 *   claim and send; once the claim is stale, a later call takes it over and sends.
 * - 'failed': composing, sending or completing threw. The claim is released so the next tick retries; if the release
 *   fails too, the claim goes stale after CLAIM_STALE_MS. A retry after a send that did go out carries the same
 *   Resend Idempotency-Key (kept 24 h), so the reader still gets one email.
 * The log never carries the address.
 */
export async function deliver(d: Deps, o: Outbound, run: DeliveryRun = newRun()): Promise<DeliverResult> {
  // The breaker is open: nothing is claimed or sent, and the caller keeps the event for the next run.
  if (run.stopped) return 'failed';
  const key: DeliveryKey = { subscriptionId: o.sub.id, kind: o.kind, periodKey: o.periodKey };
  const claim = await claimDelivery(d.sql, key, d.clock.now());
  if (claim === 'sent') {
    run.skipped++;
    return 'skipped';
  }
  if (claim === 'busy') {
    run.busy++;
    return 'busy';
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
