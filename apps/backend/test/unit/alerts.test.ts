import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailError, type Mailer } from '../../src/mail/mailer';
import { runTick } from '../../src/tick/run';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { created, T0, txh, VAULT, vaultEvent, view } from '../helpers/fixtures';
import { activeSubscriber } from '../helpers/seed';

const OPS = 'ops@atropyle.test';
const MIN = 60_000;

describe('ops alerts for a stalled indexer and failing mail (I3)', () => {
  let db: TestDb;
  let env: TestEnv;
  const alerts = () => env.mailer.sent.filter((m) => m.to === OPS);
  const subjects = () => alerts().map((m) => m.subject);
  const tickAt = async (offsetMs: number, t0: number) => {
    env.clock.set(t0 + offsetMs);
    return runTick(env.d);
  };

  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    env.chain.created = [created()];
    env.chain.logs = [vaultEvent('Alive', { at: T0 - 100n }, { blockNumber: 150n, transactionHash: txh(1) })];
    // Checked in at T0 - 100, late at T0 + 20: the 80% reminder is due at T0.
    env.chain.setView(view({ lastAlive: T0 - 100n, lateAt: T0 + 20n, nextCheckAt: T0 + 20n }));
  });

  it('indexer-lag fires after 15 minutes without reaching head − margin, and resolves once caught up', async () => {
    const t0 = env.clock.now();
    await tickAt(0, t0);
    // The RPC stops serving logs, then the head too: the cursor stays where it was.
    env.chain.headBlock = 260n;
    env.chain.failScan = () => true;
    await tickAt(5 * MIN, t0);
    const head = env.chain.head.bind(env.chain);
    env.chain.head = async () => {
      throw new Error('rpc down');
    };
    await tickAt(14 * MIN, t0);
    expect(subjects()).toEqual([]);
    await tickAt(15 * MIN, t0);
    expect(subjects()).toEqual(['[Atropyle ops] indexer-lag: firing']);
    expect(alerts()[0].text).toContain('2026-11-23T12:00:00.000Z');
    await tickAt(16 * MIN, t0);
    expect(subjects()).toHaveLength(1);

    env.chain.head = head;
    env.chain.failScan = null;
    await tickAt(17 * MIN, t0);
    expect(subjects()).toEqual(['[Atropyle ops] indexer-lag: firing', '[Atropyle ops] indexer-lag: resolved']);
  });

  it('indexer-lag fires when a vault view has been stale for 30 minutes, naming how many and the oldest', async () => {
    const t0 = env.clock.now();
    env.chain.failView.add(VAULT.toLowerCase());
    await tickAt(0, t0);
    await tickAt(29 * MIN, t0);
    expect(subjects()).toEqual([]);
    await tickAt(30 * MIN, t0);
    expect(subjects()).toEqual(['[Atropyle ops] indexer-lag: firing']);
    expect(alerts()[0].text).toContain('1 vault view');
    expect(alerts()[0].text).toContain(VAULT);
    expect(alerts()[0].text).toContain('2026-11-23T12:00:00.000Z');

    env.chain.failView.clear();
    await tickAt(31 * MIN, t0);
    expect(subjects()).toEqual(['[Atropyle ops] indexer-lag: firing', '[Atropyle ops] indexer-lag: resolved']);
  });

  it('mail-failing fires after 10 minutes of failed emails with none sent, and resolves on the next success', async () => {
    await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const capture = env.mailer;
    let opsDown = false;
    const broken: Mailer = {
      send: async (m) => {
        if (m.to !== OPS || opsDown) throw new MailError('Resend answered 500', 500, null);
        return capture.send(m);
      },
    };
    env.d.mailer = broken;
    const t0 = env.clock.now();
    expect((await tickAt(0, t0)).notices).toMatchObject({ failed: 1, sent: 0 });
    await tickAt(5 * MIN, t0);
    await tickAt(9 * MIN, t0);
    expect(subjects()).toEqual([]);
    // When Resend is broken the ops email fails too: it is logged and retried on the next tick.
    opsDown = true;
    await tickAt(10 * MIN, t0);
    expect(subjects()).toEqual([]);
    expect(env.log.lines.some((l) => l.msg === 'ops alert not sent' && l.data.kind === 'mail-failing')).toBe(true);
    opsDown = false;
    await tickAt(11 * MIN, t0);
    expect(subjects()).toEqual(['[Atropyle ops] mail-failing: firing']);
    expect(alerts()[0].text).toContain('2026-11-23T12:00:00.000Z');

    env.d.mailer = capture;
    await tickAt(12 * MIN, t0);
    expect(capture.byKind('checkin-80')).toHaveLength(1);
    expect(subjects()).toEqual(['[Atropyle ops] mail-failing: firing', '[Atropyle ops] mail-failing: resolved']);
  });
});
