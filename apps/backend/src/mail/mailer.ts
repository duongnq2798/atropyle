import { type Clock, systemClock } from '../clock';
import type { Mail } from '../email/compose';
import type { EmailKind } from '../email/kinds';

export interface Mailer {
  send(mail: Mail): Promise<{ id: string }>;
}

export class MailError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Set on a 429: how long Resend asks us to wait. */
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

export const RESEND_URL = 'https://api.resend.com/emails';
/** How long one Resend call may take before it is abandoned (I1): the tick's 50 s budget must hold. */
export const RESEND_TIMEOUT_MS = 10_000;

export interface ResendOptions {
  apiKey: string;
  fetch?: typeof fetch;
  clock?: Clock;
  /** Gap between two sends (plan ruling 4): 550 ms stays under even the older 2 requests/s default. */
  minIntervalMs?: number;
  /** Default RESEND_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Resend's REST API with plain fetch (plan ruling 4). Each call is abandoned after timeoutMs; a timeout or a network
 * failure is a MailError like any other transport failure. The Idempotency-Key makes a retried send after a timeout
 * safe for 24 hours. The error never carries Resend's response body, which can quote the recipient.
 */
export function resendMailer(o: ResendOptions): Mailer {
  const f = o.fetch ?? fetch;
  const clock = o.clock ?? systemClock;
  const gap = o.minIntervalMs ?? 550;
  const timeoutMs = o.timeoutMs ?? RESEND_TIMEOUT_MS;
  let last = Number.NEGATIVE_INFINITY;
  return {
    async send(mail) {
      const wait = last + gap - clock.now();
      if (wait > 0) await clock.sleep(wait);
      last = clock.now();
      let res: Response;
      try {
        res = await f(RESEND_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${o.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': mail.idempotencyKey,
          },
          body: JSON.stringify({
            from: mail.from,
            to: [mail.to],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            headers: mail.headers,
            tags: mail.tags,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        throw new MailError(
          timedOut ? `Resend did not answer within ${timeoutMs} ms` : 'Resend unreachable',
          null,
          null,
        );
      }
      if (res.status === 429) {
        const s = Number(res.headers.get('retry-after'));
        throw new MailError('Resend rate limit', 429, Number.isFinite(s) && s > 0 ? s * 1000 : 1000);
      }
      if (!res.ok) throw new MailError(`Resend answered ${res.status}`, res.status, null);
      // A body cut off by the timeout reads as no id.
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (typeof body?.id !== 'string') throw new MailError('Resend answered without an id', res.status, null);
      return { id: body.id };
    },
  };
}

export interface CaptureMailer extends Mailer {
  sent: Mail[];
  /** The next `n` sends throw `error` (default: a 500 MailError). */
  failNext(n?: number, error?: Error): void;
  byKind(kind: EmailKind): Mail[];
}

/** Test mailer: keeps every email instead of sending it. */
export function captureMailer(): CaptureMailer {
  const sent: Mail[] = [];
  let failures = 0;
  let failure: Error = new MailError('capture failure', 500, null);
  return {
    sent,
    failNext(n = 1, error = new MailError('capture failure', 500, null)) {
      failures = n;
      failure = error;
    },
    byKind: (kind) => sent.filter((m) => m.tags.some((t) => t.name === 'kind' && t.value === kind)),
    async send(mail) {
      if (failures > 0) {
        failures--;
        throw failure;
      }
      sent.push(mail);
      return { id: `capture-${sent.length}` };
    },
  };
}

/**
 * Without RESEND_API_KEY nothing is sent. Reminders and Drill summaries go out once the key is set; an event email
 * is dropped once its event is older than 24 h (MAX_NOTICE_AGE), and the mail-failing ops alert fires meanwhile.
 */
export function disabledMailer(): Mailer {
  return {
    async send() {
      throw new MailError('RESEND_API_KEY is not set', null, null);
    },
  };
}
