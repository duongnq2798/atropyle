import { isoAt } from './clock';
import { sha256Hex } from './crypto';
import type { Deps } from './deps';
import { escapeHtml } from './email/fill';
import { errorText } from './log';
import { getMeta, setMeta } from './store/meta';

export type OpsAlert = 'keeper-balance' | 'keeper-key' | 'integrity' | 'indexer-lag' | 'mail-failing';

/**
 * Mails OPS_EMAIL when an alert starts or ends, never while it stays the same. The new state is stored only after
 * the email went out (or when no OPS_EMAIL is set), so a failed send is logged and retried on the next tick. When
 * Resend itself is broken this mail fails too: then only the log carries the alert.
 */
export async function opsAlert(
  d: Deps,
  kind: OpsAlert,
  firing: boolean,
  detail: string,
): Promise<'fired' | 'resolved' | 'unchanged' | 'failed'> {
  const key = `alert:${kind}`;
  const prev = await getMeta<{ firing: boolean }>(d.sql, key);
  if ((prev?.value.firing ?? false) === firing) return 'unchanged';
  const state = firing ? 'firing' : 'resolved';
  if (d.config.opsEmail) {
    try {
      await d.mailer.send({
        from: d.config.mailFrom,
        to: d.config.opsEmail,
        subject: `[Atropyle ops] ${kind}: ${state}`,
        html: `<pre>${escapeHtml(detail)}</pre>`,
        text: detail,
        headers: {},
        tags: [{ name: 'kind', value: 'ops' }],
        idempotencyKey: await sha256Hex(`ops:${kind}:${state}:${Math.floor(d.clock.now() / 60_000)}`),
      });
    } catch (e) {
      d.log.error('ops alert not sent', { kind, state, error: errorText(e) });
      return 'failed';
    }
  }
  await setMeta(d.sql, key, { firing, detail }, isoAt(d.clock.now()));
  d.log.warn('ops alert', { kind, state });
  return firing ? 'fired' : 'resolved';
}
