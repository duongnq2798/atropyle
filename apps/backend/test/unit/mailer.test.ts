import { describe, expect, it } from 'vitest';
import { SAMPLE_CONFIG, sampleInput } from '../../emails/samples';
import { fakeClock } from '../../src/clock';
import { composeEmail } from '../../src/email/compose';
import { captureMailer, disabledMailer, MailError, RESEND_URL, resendMailer } from '../../src/mail/mailer';

const mail = composeEmail(SAMPLE_CONFIG, sampleInput('welcome', 'en'));

function fakeFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  }) as typeof fetch;
  return { f, calls };
}

describe('resendMailer', () => {
  it('posts the email to Resend with the key, the idempotency key and the unsubscribe headers', async () => {
    const { f, calls } = fakeFetch([Response.json({ id: 'msg_1' })]);
    const r = await resendMailer({ apiKey: 're_test', fetch: f, clock: fakeClock() }).send(mail);
    expect(r).toEqual({ id: 'msg_1' });
    expect(calls[0]?.url).toBe(RESEND_URL);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: 'Bearer re_test',
      'content-type': 'application/json',
      'idempotency-key': mail.idempotencyKey,
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: mail.from,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
      tags: mail.tags,
    });
  });

  it('turns a 429 into a MailError with the retry-after delay, and other failures into a MailError', async () => {
    const { f } = fakeFetch([
      new Response('{}', { status: 429, headers: { 'retry-after': '2' } }),
      new Response('{}', { status: 422 }),
      Response.json({}),
    ]);
    const m = resendMailer({ apiKey: 're_test', fetch: f, clock: fakeClock() });
    await expect(m.send(mail)).rejects.toMatchObject({ name: 'MailError', status: 429, retryAfterMs: 2000 });
    await expect(m.send(mail)).rejects.toMatchObject({ status: 422, retryAfterMs: null });
    await expect(m.send(mail)).rejects.toThrow('without an id');
  });

  it('spaces sends at least minIntervalMs apart', async () => {
    const clock = fakeClock();
    const { f } = fakeFetch([Response.json({ id: 'a' }), Response.json({ id: 'b' })]);
    const m = resendMailer({ apiKey: 're_test', fetch: f, clock, minIntervalMs: 550 });
    const t0 = clock.now();
    await m.send(mail);
    await m.send(mail);
    expect(clock.now() - t0).toBeGreaterThanOrEqual(550);
  });
});

describe('test and disabled mailers', () => {
  it('captures, fails on demand and filters by kind', async () => {
    const m = captureMailer();
    m.failNext(1, new MailError('boom', 500, null));
    await expect(m.send(mail)).rejects.toThrow('boom');
    expect(await m.send(mail)).toEqual({ id: 'capture-1' });
    expect(m.byKind('welcome')).toHaveLength(1);
    expect(m.byKind('confirm')).toHaveLength(0);
  });

  it('refuses to send when RESEND_API_KEY is not set', async () => {
    await expect(disabledMailer().send(mail)).rejects.toThrow('RESEND_API_KEY is not set');
  });
});
