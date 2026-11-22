import { createAtropyle, type PlanInput, parseDeployment, type VaultStatus } from '@atropyle/sdk';
import { type Address, createWalletClient, erc20Abi, type Hex, http, type WalletClient } from 'viem';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ANVIL_ACCOUNTS, increaseTime } from '../../../../scripts/lib/anvil';
import { createSdkChain } from '../../src/chain/sdk';
import { systemClock } from '../../src/clock';
import type { Deps } from '../../src/deps';
import type { Mail } from '../../src/email/compose';
import { formatDeadline } from '../../src/email/format';
import { confirm } from '../../src/functions/confirm';
import { subscribe } from '../../src/functions/subscribe';
import { unsubscribe } from '../../src/functions/unsubscribe';
import { memoryLog } from '../../src/log';
import { captureMailer } from '../../src/mail/mailer';
import { activeSubscribers } from '../../src/store/subscriptions';
import { getVault } from '../../src/store/vaults';
import { runTick, type TickResult } from '../../src/tick/run';
import { type TestDb, testDb } from '../helpers/db';
import { testConfig } from '../helpers/deps';
import { API, bodyOf, postJson, SITE, tokenFrom } from '../helpers/http';

const [, OWNER, HEIR, , , , , KEEPER] = ANVIL_ACCOUNTS;
const OWNER_EMAIL = 'owner@example.com';
const HEIR_EMAIL = 'heir@example.com';

describe('a Drill from creation to its summary, driven only by tick (spec §9.3, §12)', () => {
  const rpcUrl = inject('rpcUrl');
  const atro = createAtropyle({ chain: parseDeployment(inject('deployment')), builderCode: null });
  const usdt0 = atro.deployment.feeTokens[0];
  /** An unlocked anvil account: viem sends eth_sendTransaction and anvil signs. No key exists in this test. */
  const wallet = (account: Address): WalletClient =>
    createWalletClient({ account, chain: atro.chain, transport: http(rpcUrl) });
  const mailer = captureMailer();
  const log = memoryLog();
  let db: TestDb;
  let d: Deps;
  let vault: Address;
  /** Right after creation. */
  let s0: VaultStatus;
  /** Right after the keeper raised the alarm. */
  let s1: VaultStatus;

  /** The devnet warp (evm_increaseTime + evm_mine) to at least `target`; returns the new block's time. */
  async function warpTo(target: bigint): Promise<bigint> {
    const now = (await atro.publicClient.getBlock()).timestamp;
    if (target > now) await increaseTime(rpcUrl, Number(target - now));
    return (await atro.publicClient.getBlock()).timestamp;
  }

  async function tick(): Promise<TickResult> {
    const r = await runTick(d);
    expect(r.errors).toEqual([]);
    expect(r.status).toBe('ok');
    return r;
  }

  const kindOf = (m: Mail) => m.tags.find((t) => t.name === 'kind')?.value;
  /** `<to>:<kind>` of every email captured from index `from` on. */
  const sentSince = (from: number) => mailer.sent.slice(from).map((m) => `${m.to}:${kindOf(m)}`);
  const lastTo = (to: string): Mail => {
    const m = mailer.sent.filter((x) => x.to === to).at(-1);
    if (!m) throw new Error(`no email to ${to}`);
    return m;
  };
  const keeperLog = () =>
    db.query<{ action: string | null; status: string; tx_hash: string | null }>(
      'select action, status, tx_hash from public.keeper_log order by id',
    );
  const heirBalance = () =>
    atro.publicClient.readContract({ address: usdt0, abi: erc20Abi, functionName: 'balanceOf', args: [HEIR] });

  beforeAll(async () => {
    db = await testDb();
    d = {
      sql: db,
      chain: createSdkChain(atro, { wallet: wallet(KEEPER) }),
      mailer,
      clock: systemClock,
      log,
      config: testConfig({ headMargin: 0 }),
      random: (size) => crypto.getRandomValues(new Uint8Array(size)),
      keeperError: null,
    };
  });

  afterAll(async () => {
    await db.close();
  });

  it('indexes a new Drill and subscribes its owner and heir through the double opt-in', async () => {
    const drill: PlanInput = {
      heirs: [{ account: HEIR }],
      timing: 'drill',
      assets: [{ kind: 'erc20', token: usdt0 }],
    };
    const plan = await atro.prepare.createVault(drill, { owner: OWNER, drill: true });
    await atro.send(plan, wallet(OWNER));
    vault = plan.vault;
    s0 = await atro.vault(vault).status();
    expect(s0.lateAt - s0.lastAlive).toBe(120n);

    const first = await tick();
    expect(first.indexer).toMatchObject({ created: 1, caughtUp: true, error: null });
    expect(await getVault(db, vault)).toMatchObject({
      drill: true,
      state: 'active',
      lastAlive: s0.lastAlive,
      lateAt: s0.lateAt,
      nextCheckAt: s0.lateAt,
    });

    const signUp = async (body: Record<string, string>) => {
      const res = await subscribe(postJson('subscribe', { ...body, vault, website: '' }), d);
      expect(res.status).toBe(202);
    };
    await signUp({ email: ' Owner@Example.com ', role: 'owner', lang: 'en' });
    await signUp({ email: HEIR_EMAIL, role: 'heir', lang: 'vi' });
    expect(sentSince(0)).toEqual([`${OWNER_EMAIL}:confirm`, `${HEIR_EMAIL}:confirm`]);

    for (const m of mailer.byKind('confirm')) {
      const res = await confirm(postJson('confirm', { token: tokenFrom(m, 'confirm') }), d);
      expect(await bodyOf(res)).toMatchObject({ ok: true, vault });
    }
    expect(sentSince(2)).toEqual([`${OWNER_EMAIL}:welcome`, `${HEIR_EMAIL}:welcome`]);
    const subs = await activeSubscribers(db, vault);
    expect(subs.map((s) => `${s.email}:${s.role}:${s.lang}`).sort()).toEqual([
      `${HEIR_EMAIL}:heir:vi`,
      `${OWNER_EMAIL}:owner:en`,
    ]);
  });

  it('sends nothing before half the period, then the 50% reminder exactly once', async () => {
    let from = mailer.sent.length;
    await tick();
    expect(sentSince(from)).toEqual([]);

    const at = await warpTo(s0.lastAlive + 61n);
    expect(at - s0.lastAlive).toBeLessThan(96n);
    await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:checkin-50`]);
    expect(lastTo(OWNER_EMAIL).text).toContain(formatDeadline(s0.lateAt, 'en'));

    from = mailer.sent.length;
    await tick();
    expect(sentSince(from)).toEqual([]);
  });

  it('sends the 80% reminder while the keeper still waits for lateAt', async () => {
    const from = mailer.sent.length;
    const at = await warpTo(s0.lastAlive + 97n);
    expect(at).toBeLessThan(s0.lateAt);
    const r = await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:checkin-80`]);
    expect(r.keeper).toMatchObject({ ran: true, dryRun: false, due: 0, sent: 0, stopped: null });
    expect(await keeperLog()).toEqual([]);
  });

  it('at lateAt mails checkin-due, and the keeper raises the alarm with poke', async () => {
    const from = mailer.sent.length;
    await warpTo(s0.lateAt + 1n);
    const r = await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:checkin-due`]);
    expect(r.keeper).toMatchObject({ due: 1, sent: 1 });

    const rows = await keeperLog();
    expect(rows).toMatchObject([{ action: 'poke', status: 'sent' }]);
    const receipt = await atro.publicClient.getTransactionReceipt({ hash: rows[0].tx_hash as Hex });
    expect(receipt.from.toLowerCase()).toBe(KEEPER.toLowerCase());
    const block = await atro.publicClient.getBlock({ blockNumber: receipt.blockNumber });
    expect(block.timestamp >= s0.lateAt).toBe(true);

    s1 = await atro.vault(vault).status();
    expect(s1.state).toBe('grace');
    expect(s1.windowEndsAt).not.toBeNull();
  });

  it('mails the alarm to the owner in English and to the heir in Vietnamese on the next tick', async () => {
    const from = mailer.sent.length;
    const windowEndsAt = s1.windowEndsAt as bigint;
    const r = await tick();
    expect(r.indexer?.events).toBe(2); // AlarmRaised and StateChanged of the poke
    expect(r.keeper?.sent).toBe(0);
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:alarm-owner`, `${HEIR_EMAIL}:alarm-heir`]);
    expect(lastTo(OWNER_EMAIL).text).toContain(formatDeadline(windowEndsAt, 'en'));
    expect(lastTo(HEIR_EMAIL).text).toContain(formatDeadline(windowEndsAt, 'vi'));
    expect(await getVault(db, vault)).toMatchObject({ state: 'grace', windowEndsAt });
  });

  it('distributes when the window ends, then mails released and distributed to the heir', async () => {
    const before = await heirBalance();
    let from = mailer.sent.length;
    await warpTo((s1.windowEndsAt as bigint) + 1n);
    const r = await tick();
    expect(sentSince(from)).toEqual([]);
    expect(r.keeper).toMatchObject({ sent: 1 });
    expect((await keeperLog()).map((l) => `${l.action}:${l.status}`)).toEqual(['poke:sent', 'distribute:sent']);
    expect((await heirBalance()) - before).toBe(10_000_000_000n);
    expect((await atro.vault(vault).status()).state).toBe('releasedInherit');

    from = mailer.sent.length;
    await tick();
    expect(sentSince(from)).toEqual([`${HEIR_EMAIL}:released`, `${HEIR_EMAIL}:distributed`]);
    expect(lastTo(HEIR_EMAIL).text).toContain(`10000 token ${usdt0} cho ${HEIR}`);

    from = mailer.sent.length;
    const quiet = await tick();
    expect(sentSince(from)).toEqual([]);
    expect(quiet.keeper?.sent).toBe(0);
  });

  it('sends the Drill summary to the owner once the Drill has expired, and only once', async () => {
    const from = mailer.sent.length;
    await warpTo((s0.expiresAt as bigint) + 1n);
    await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:drill-summary`]);
    const summary = lastTo(OWNER_EMAIL).text;
    expect(summary).toContain('Check-ins: 0');
    expect(summary).toContain('Alarms: 1');

    const again = mailer.sent.length;
    await tick();
    expect(sentSince(again)).toEqual([]);
  });

  it('linked only to the site, carried one-click unsubscribe, and logged no error', async () => {
    expect(sentSince(0)).toEqual([
      `${OWNER_EMAIL}:confirm`,
      `${HEIR_EMAIL}:confirm`,
      `${OWNER_EMAIL}:welcome`,
      `${HEIR_EMAIL}:welcome`,
      `${OWNER_EMAIL}:checkin-50`,
      `${OWNER_EMAIL}:checkin-80`,
      `${OWNER_EMAIL}:checkin-due`,
      `${OWNER_EMAIL}:alarm-owner`,
      `${HEIR_EMAIL}:alarm-heir`,
      `${HEIR_EMAIL}:released`,
      `${HEIR_EMAIL}:distributed`,
      `${OWNER_EMAIL}:drill-summary`,
    ]);
    for (const m of mailer.sent) {
      const links = [
        ...[...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]),
        ...[...m.text.matchAll(/https?:\/\/\S+/g)].map((x) => x[0]),
      ];
      expect(links.length, kindOf(m)).toBeGreaterThan(0);
      for (const l of links) expect(l.startsWith(`${SITE}/`), `${kindOf(m)}: ${l}`).toBe(true);
      expect(m.headers['List-Unsubscribe'].startsWith(`<${API}/unsubscribe?t=`), kindOf(m)).toBe(true);
      expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }

    // What a mail client does with the header (RFC 8058): a POST without Origin, form-encoded.
    const token = /\?t=([A-Za-z0-9_-]{43})>$/.exec(lastTo(HEIR_EMAIL).headers['List-Unsubscribe'])?.[1];
    expect(token).toBeDefined();
    const res = await unsubscribe(
      new Request(`${API}/unsubscribe?t=${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
      d,
    );
    expect(res.status).toBe(200);
    expect((await activeSubscribers(db, vault)).map((s) => s.email)).toEqual([OWNER_EMAIL]);

    expect(log.lines.filter((l) => l.level === 'error')).toEqual([]);
  });
});
