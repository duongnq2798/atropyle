import { zeroAddress } from 'viem';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailError } from '../../src/mail/mailer';
import { CLAIM_STALE_MS } from '../../src/store/deliveries';
import { insertEvents, saveView } from '../../src/store/vaults';
import { runNotices } from '../../src/tick/notices';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { HEIR, T0, TOKEN, txh, VAULT, vaultEvent, view } from '../helpers/fixtures';
import { activeSubscriber, seedVault } from '../helpers/seed';

const ISO = '2026-11-23T12:00:00.000Z';

describe('runNotices (spec §9.3.2)', () => {
  let db: TestDb;
  let env: TestEnv;
  const far = () => env.clock.now() + 60_000;
  const add = (
    name: string,
    args: Record<string, unknown>,
    o: { block: bigint; at: bigint; tx: number; logIndex?: number },
  ) =>
    insertEvents(db, [
      {
        event: vaultEvent(name, args, { blockNumber: o.block, transactionHash: txh(o.tx), logIndex: o.logIndex ?? 0 }),
        at: o.at,
      },
    ]);
  const unnotified = async () =>
    (await db.query<{ n: number }>('select count(*)::int as n from public.vault_events where notified_at is null'))[0]
      .n;

  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
  });

  async function subscribers() {
    return {
      owner: await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' }),
      heir: await activeSubscriber(db, { email: 'heir@example.com', vault: VAULT, role: 'heir', lang: 'vi' }),
      guardian: await activeSubscriber(db, { email: 'guardian@example.com', vault: VAULT, role: 'guardian' }),
    };
  }

  it('mails an alarm to owner, guardian and heir once, and marks the event', async () => {
    await seedVault(db, view({ state: 'grace', pending: 'grace', windowEndsAt: T0 + 115n }));
    await subscribers();
    await add('AlarmRaised', { state: 1, target: zeroAddress }, { block: 190n, at: T0 - 5n, tx: 10 });
    const r = await runNotices(env.d, T0, far(), true);
    expect(r).toMatchObject({ sent: 3, failed: 0, stopped: false, events: 2 });
    expect(env.mailer.sent.map((m) => `${m.to}:${m.tags[0].value}`).sort()).toEqual([
      'guardian@example.com:alarm-guardian',
      'heir@example.com:alarm-heir',
      'owner@example.com:alarm-owner',
    ]);
    expect(env.mailer.byKind('alarm-heir')[0].text).toContain('giờ Việt Nam');
    expect(await unnotified()).toBe(0);
    const again = await runNotices(env.d, T0, far(), true);
    expect(again).toMatchObject({ sent: 0, events: 0 });
  });

  it('keeps an event unnotified when an email fails, and sends exactly once on the next run (review focus 2)', async () => {
    await seedVault(db, view({ state: 'releasedInherit', pending: 'releasedInherit', released: true }));
    await subscribers();
    await add('Released', { state: 5, target: zeroAddress }, { block: 190n, at: T0 - 5n, tx: 11 });
    env.mailer.failNext(1, new MailError('Resend rate limit', 429, 1000));
    const first = await runNotices(env.d, T0, far(), true);
    expect(first).toMatchObject({ stopped: true, failed: 1 });
    expect(await unnotified()).toBeGreaterThan(0);
    const second = await runNotices(env.d, T0, far(), true);
    expect(second).toMatchObject({ stopped: false, failed: 0 });
    const third = await runNotices(env.d, T0, far(), true);
    expect(third).toMatchObject({ sent: 0 });
    expect(
      env.mailer
        .byKind('released')
        .map((m) => m.to)
        .sort(),
    ).toEqual(['guardian@example.com', 'heir@example.com']);
    expect(await unnotified()).toBe(0);
  });

  it('keeps an event open while a dead run still holds a fresh claim, then sends once after the claim goes stale (C1)', async () => {
    await seedVault(db, view({ state: 'grace', pending: 'grace', windowEndsAt: T0 + 115n }));
    const owner = await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    await add('AlarmRaised', { state: 1, target: zeroAddress }, { block: 190n, at: T0 - 5n, tx: 10 });
    // Run A claimed alarm-owner two minutes ago, then its isolate was killed before the send (no release).
    await db.query(
      `insert into public.deliveries (subscription_id, kind, period_key, claimed_at)
       values ($1::bigint, 'alarm-owner', $2::text, $3::timestamptz)`,
      [owner.id, `${txh(10)}:0`, new Date(env.clock.now() - 120_000).toISOString()],
    );
    // Run C, inside the stale window: the alarm stays open (only the seeded Alive event is marked).
    const inside = await runNotices(env.d, T0, far(), true);
    expect(inside).toMatchObject({ sent: 0, busy: 1, events: 1 });
    expect(env.mailer.sent).toEqual([]);
    expect(await unnotified()).toBe(1);

    // Past the stale window the claim is taken over: one email, then the event is marked.
    env.clock.advance(CLAIM_STALE_MS);
    const after = await runNotices(env.d, T0, far(), true);
    expect(after).toMatchObject({ sent: 1, busy: 0, events: 1 });
    expect(env.mailer.byKind('alarm-owner').map((m) => m.to)).toEqual(['owner@example.com']);
    expect(await unnotified()).toBe(0);
    await runNotices(env.d, T0, far(), true);
    expect(env.mailer.sent).toHaveLength(1);
  });

  it('sends one payout email per transaction and skips events older than 24 hours', async () => {
    await seedVault(db, view({ state: 'releasedInherit', pending: 'releasedInherit', released: true }));
    await subscribers();
    await add(
      'Distributed',
      { assetIndex: '0', to: HEIR, amountOrId: '10000000000' },
      { block: 191n, at: T0 - 4n, tx: 12, logIndex: 1 },
    );
    await add(
      'Distributed',
      { assetIndex: '0', to: HEIR, amountOrId: '5000000' },
      { block: 191n, at: T0 - 4n, tx: 12, logIndex: 2 },
    );
    await add('Released', { state: 5, target: zeroAddress }, { block: 10n, at: T0 - 90_000n, tx: 13 });
    const r = await runNotices(env.d, T0, far(), true);
    expect(env.mailer.byKind('released')).toEqual([]);
    const [paid] = env.mailer.byKind('distributed');
    expect(env.mailer.byKind('distributed')).toHaveLength(1);
    expect(paid.to).toBe('heir@example.com');
    expect(paid.text).toContain(`10000 token ${TOKEN} cho ${HEIR}`);
    expect(paid.text).toContain(`5 token ${TOKEN} cho ${HEIR}`);
    expect(r.events).toBe(4);
    expect(await unnotified()).toBe(0);
  });

  it('reminds the owner at 50%, 80% and due, once each per check-in (spec §9.3.2)', async () => {
    // Check-in at T0 - 10 (Alive at block 150), late at T0 + 110: 50% at T0 + 50, 80% at T0 + 86.
    await seedVault(db, view());
    const { owner } = await subscribers();
    await runNotices(env.d, T0 + 49n, far(), true);
    expect(env.mailer.sent.filter((m) => m.to === owner.email)).toEqual([]);
    for (const [t, kind] of [
      [T0 + 50n, 'checkin-50'],
      [T0 + 60n, null],
      [T0 + 86n, 'checkin-80'],
      [T0 + 110n, 'checkin-due'],
      [T0 + 500n, null],
    ] as const) {
      const before = env.mailer.sent.length;
      await runNotices(env.d, t, far(), true);
      const fresh = env.mailer.sent.slice(before).map((m) => m.tags[0].value);
      expect(fresh, String(t)).toEqual(kind === null ? [] : [kind]);
    }
    const due = env.mailer.byKind('checkin-due')[0];
    expect(due.to).toBe('owner@example.com');
    expect(due.text).toContain('Deadline:');
  });

  it('sends only the highest reminder when several are due at once', async () => {
    await seedVault(db, view());
    await subscribers();
    await runNotices(env.d, T0 + 100n, far(), true);
    expect(env.mailer.sent.map((m) => m.tags[0].value)).toEqual(['checkin-80']);
  });

  it('starts a new reminder cycle after a check-in: all three reminders fire again (review focus 5)', async () => {
    await seedVault(db, view());
    await subscribers();
    await runNotices(env.d, T0 + 90n, far(), true);
    expect(env.mailer.sent.map((m) => m.tags[0].value)).toEqual(['checkin-80']);
    // The owner checks in at T0 + 95 (block 240): a new Alive event, a new view, a new period key.
    await add('Alive', { at: T0 + 95n }, { block: 240n, at: T0 + 95n, tx: 20 });
    await saveView(db, view({ lastAlive: T0 + 95n, lateAt: T0 + 215n, nextCheckAt: T0 + 215n }), ISO);
    // New cycle: 50% at T0 + 155, 80% at T0 + 191, due at T0 + 215.
    for (const t of [T0 + 155n, T0 + 191n, T0 + 215n]) await runNotices(env.d, t, far(), true);
    expect(env.mailer.sent.map((m) => m.tags[0].value)).toEqual([
      'checkin-80',
      'checkin-50',
      'checkin-80',
      'checkin-due',
    ]);
    const keys = await db.query<{ kind: string; period_key: string }>(
      "select kind, period_key from public.deliveries where kind like 'checkin-%' order by period_key, kind",
    );
    expect(keys.map((k) => `${k.period_key}:${k.kind}`)).toEqual([
      '150:checkin-80',
      '240:checkin-50',
      '240:checkin-80',
      '240:checkin-due',
    ]);
  });

  it('waits with reminders until the indexer has caught up, and skips vaults without a known check-in block', async () => {
    await seedVault(db, view());
    await subscribers();
    expect(await runNotices(env.d, T0 + 100n, far(), false)).toMatchObject({ reminders: 0, sent: 0 });
    await db.reset();
    await seedVault(db, view(), { aliveBlock: null });
    await subscribers();
    expect(await runNotices(env.d, T0 + 100n, far(), true)).toMatchObject({ reminders: 0, sent: 0 });
  });

  it('sends the owner one Drill summary after expiry, with check-ins and alarms counted', async () => {
    await seedVault(
      db,
      view({ state: 'releasedInherit', pending: 'releasedInherit', released: true, expiresAt: T0 + 1000n }),
    );
    await subscribers();
    await add('Alive', { at: T0 + 20n }, { block: 170n, at: T0 + 20n, tx: 30 });
    await add('AlarmRaised', { state: 1, target: zeroAddress }, { block: 180n, at: T0 + 30n, tx: 31 });
    await add('Released', { state: 5, target: zeroAddress }, { block: 185n, at: T0 + 40n, tx: 32 });
    await runNotices(env.d, T0 + 999n, far(), true);
    expect(env.mailer.byKind('drill-summary')).toEqual([]);
    await runNotices(env.d, T0 + 1000n, far(), true);
    await runNotices(env.d, T0 + 1060n, far(), true);
    const summaries = env.mailer.byKind('drill-summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].to).toBe('owner@example.com');
    expect(summaries[0].text).toContain('Check-ins: 1');
    expect(summaries[0].text).toContain('Alarms: 1');
    expect(summaries[0].text).toContain('It went all the way');
  });
});
