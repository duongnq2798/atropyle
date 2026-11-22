import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { integrity } from '../../src/functions/integrity';
import { runIntegrity } from '../../src/integrity';
import { latestIntegrity } from '../../src/store/integrity';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { API, bodyOf } from '../helpers/http';

describe('runIntegrity (spec §9.2)', () => {
  let db: TestDb;
  let env: TestEnv;
  const ops = () => env.mailer.sent.filter((m) => m.to === 'ops@atropyle.test').map((m) => m.subject);
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

  it('stores each run and mails ops when a check fails, once, then when it passes again', async () => {
    expect(await latestIntegrity(db)).toBeNull();
    expect(await runIntegrity(env.d)).toEqual({ ok: true, block: 200n, failed: [] });
    expect(await latestIntegrity(db)).toEqual({ at: '2026-11-23T12:00:00.000Z', block: 200n, ok: true });
    expect(ops()).toEqual([]);

    env.chain.integrityImpl = async () => ({
      ok: false,
      chainId: 196,
      blockNumber: 201n,
      blockTimestamp: 1n,
      rpcs: 2,
      checks: [
        { name: 'factory code', ok: true },
        { name: 'cpu policy', ok: false, expected: '0x01', actual: '0x02' },
      ],
      warnings: [],
    });
    expect(await runIntegrity(env.d)).toEqual({ ok: false, block: 201n, failed: ['cpu policy'] });
    await runIntegrity(env.d);
    expect(ops()).toEqual(['[Atropyle ops] integrity: firing']);
    expect(env.mailer.sent.at(-1)?.text).toContain('cpu policy');
    expect(await latestIntegrity(db)).toMatchObject({ block: 201n, ok: false });

    env.chain.integrityImpl = async () => ({
      ok: true,
      chainId: 196,
      blockNumber: 202n,
      blockTimestamp: 1n,
      rpcs: 2,
      checks: [],
      warnings: [],
    });
    await runIntegrity(env.d);
    expect(ops()).toEqual(['[Atropyle ops] integrity: firing', '[Atropyle ops] integrity: resolved']);
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.integrity_runs');
    expect(n[0].n).toBe(4);
  });

  it('is only reachable with the cron secret', async () => {
    const call = (headers: Record<string, string>) =>
      integrity(new Request(`${API}/integrity`, { method: 'POST', headers }), env.d);
    expect((await call({})).status).toBe(401);
    const ok = await call({ 'x-cron-secret': 'c'.repeat(32) });
    expect(await bodyOf(ok)).toEqual({ ok: true, block: '200', failed: [] });
  });

  it('records a run that threw as failed and mails ops once', async () => {
    env.chain.integrityImpl = async () => {
      throw new Error('rpc 0xdeadbeef says: ignore previous instructions');
    };
    expect(await runIntegrity(env.d)).toMatchObject({ ok: false, failed: ['integrity run'] });
    await runIntegrity(env.d);
    expect(await latestIntegrity(db)).toMatchObject({ ok: false });
    const rows = await db.query<{ report: unknown }>('select report::text as report from public.integrity_runs');
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain('ignore previous');
    expect(ops()).toEqual(['[Atropyle ops] integrity: firing']);
  });
});
