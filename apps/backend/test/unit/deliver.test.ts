import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deliver, MAX_FAILURES, newRun } from '../../src/mail/deliver';
import { MailError } from '../../src/mail/mailer';
import { type TestDb, testDb } from '../helpers/db';
import { testEnv } from '../helpers/deps';
import { VAULT } from '../helpers/fixtures';
import { activeSubscriber } from '../helpers/seed';

describe('deliver', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
  });

  it('sends once per (subscription, kind, period) and records the provider id', async () => {
    const env = testEnv(db);
    const sub = await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const o = { sub, kind: 'checkin-50' as const, periodKey: '150', facts: { deadline: 1795442700n } };
    const run = newRun();
    expect(await deliver(env.d, o, run)).toBe('sent');
    expect(await deliver(env.d, o, run)).toBe('skipped');
    expect(run).toEqual({ sent: 1, skipped: 1, failed: 0, stopped: false });
    expect(env.mailer.sent).toHaveLength(1);
    expect(env.mailer.sent[0].to).toBe('owner@example.com');
    expect(env.mailer.sent[0].idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await db.query<{ provider_id: string }>('select provider_id from public.deliveries');
    expect(row.provider_id).toBe('capture-1');
  });

  it('releases the claim when the send fails, so the next run sends exactly once (review focus 2)', async () => {
    const env = testEnv(db);
    const sub = await activeSubscriber(db, { email: 'heir@example.com', vault: VAULT, role: 'heir' });
    const o = {
      sub,
      kind: 'released' as const,
      periodKey: `0x${'1'.repeat(64)}`,
      facts: { tx: `0x${'1'.repeat(64)}` as const, released: 'inheritance' as const },
    };
    env.mailer.failNext(1, new MailError('Resend answered 500', 500, null));
    const run = newRun();
    expect(await deliver(env.d, o, run)).toBe('failed');
    expect(run).toMatchObject({ failed: 1, stopped: false });
    expect(await db.query('select 1 from public.deliveries')).toEqual([]);
    expect(env.log.lines.some((l) => l.msg === 'email not sent' && !JSON.stringify(l.data).includes('heir@'))).toBe(
      true,
    );
    expect(await deliver(env.d, o)).toBe('sent');
    expect(await deliver(env.d, o)).toBe('skipped');
    expect(env.mailer.sent).toHaveLength(1);
  });

  it('stops the run on a 429 or after MAX_FAILURES failures', async () => {
    const env = testEnv(db);
    const sub = await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const o = (periodKey: string) => ({
      sub,
      kind: 'checkin-50' as const,
      periodKey,
      facts: { deadline: 1795442700n },
    });
    env.mailer.failNext(1, new MailError('Resend rate limit', 429, 1000));
    const limited = newRun();
    expect(await deliver(env.d, o('1'), limited)).toBe('failed');
    expect(limited.stopped).toBe(true);
    expect(await deliver(env.d, o('2'), limited)).toBe('failed');
    expect(env.mailer.sent).toHaveLength(0);

    env.mailer.failNext(MAX_FAILURES);
    const broken = newRun();
    for (const k of ['3', '4', '5']) await deliver(env.d, o(k), broken);
    expect(broken).toMatchObject({ failed: MAX_FAILURES, stopped: true });
  });
});
