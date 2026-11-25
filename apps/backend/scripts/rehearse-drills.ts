// npm run rehearse:drills [-- --fork-url https://rpc.xlayer.tech] [--a-timing 60,2,120] [--b-timing 86400,1,120]
//                          [--out <report.json>]
//
// Rehearses the two mainnet Drills of the submission video on an anvil fork of X Layer mainnet that this script
// starts itself, against the deployed factory, vault implementation and ATRO processor:
//   0. the keeper's first tick after a deploy, then the team's old Drill (owner silent since 22 Nov 2026): poked
//      and released by the keeper before it expires. Once the real keeper is deployed it does this on mainnet first,
//      so a later fork starts with the old Drill in grace or released and expects one keeper poke or none
//      (old-drill.ts);
//   A. inheritance: the owner creates a Drill and approves one token, then goes silent; the keeper raises the
//      alarm, releases and distributes; the heir signs nothing;
//   B. recovery: 2 of 3 guardians vote for a new wallet; the keeper releases and moves the assets there.
// The keeper is the backend's own code: runTick (indexer, notices, keeper phase) over PGlite with the production
// tick limits and no mailer, the way a keeper-only Supabase deploy runs it.
//
// It never signs. Every sender (owners, guardians, the keeper) is a fresh random address impersonated on the fork
// (anvil_impersonateAccount + eth_sendTransaction), and no key exists anywhere. drill-guards.ts refuses every write
// unless the RPC is the loopback anvil fork this script has just started and verified; it refuses any signing or
// raw-transaction method always. The fork keeps chain id 196, so the SDK runs deployments/xlayer.json unchanged
// except for its RPC URL: no contract or processor reads block.chainid, and nothing here produces a signature that
// could be replayed on mainnet.
//
// Fork transaction hashes are local to the fork. Gas is what the fork measured; the OKB cost uses the mainnet gas
// price read from --fork-url when the run started (X Layer charges no L1 fee today: l1Fee 0 in its receipts).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  type AtropyleClient,
  createAtropyle,
  type PlanInput,
  parseDeployment,
  type StateName,
  stringify,
  type TxPlan,
  type VaultStatus,
} from '@atropyle/sdk';
import {
  type Address,
  bytesToHex,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  type Hex,
  http,
  keccak256,
  parseAbi,
  type Transport,
  toHex,
  type WalletClient,
} from 'viem';
import { startAnvil } from '../../../scripts/lib/anvil';
import { createSdkChain } from '../src/chain/sdk';
import { systemClock } from '../src/clock';
import { TICK_DEFAULTS } from '../src/config';
import type { Deps } from '../src/deps';
import { memoryLog } from '../src/log';
import { disabledMailer } from '../src/mail/mailer';
import { setCursor } from '../src/store/meta';
import { runTick, type TickResult } from '../src/tick/run';
import { type TestDb, testDb } from '../test/helpers/db';
import { testConfig } from '../test/helpers/deps';
import {
  assertFreshAnvilFork,
  assertLoopbackRpc,
  assertUpstream,
  type Fetch,
  type Gate,
  guardFetch,
  XLAYER_CHAIN_ID,
} from './drill-guards';
import { oldDrillExpectation } from './old-drill';

const DEPLOYMENT_FILE = new URL('../../../deployments/xlayer.json', import.meta.url);
const DEFAULT_UPSTREAM = 'https://rpc.xlayer.tech';
/** Wrapped OKB on X Layer (symbol WOKB, 18 decimals, read on chain 25 Nov 2026). Native OKB cannot be inherited. */
const WOKB: Address = '0xe538905cf8410324e03A5A23C1c177a474D59b2b';
/** The team's Drill of 22 Nov 2026 (docs/deployments.md): owner = deployer, heir = treasury, no assets. */
const OLD_DRILL: Address = '0x481F28748959036B48bc6779797228D74f15f4b9';
/** One tick a minute: pg_cron 'atropyle-tick' is '* * * * *' (supabase/migrations/20261123000100_schedule.sql). */
const CRON_SECONDS = 60;
/** Seconds from the cron's whole minute to the head the tick reads (pg_net, function start); an assumption. */
const TICK_LAG = 2n;
/**
 * Ticks after the first one for the old Drill to end released. Its timing is 1m/2/1m: from an alarm, three ticks at
 * most; from an owner check-in on mainnet, lateAt and the window take about six. Eight leave room.
 */
const OLD_DRILL_TICKS = 8;
const OKB = 10n ** 18n;
const GAS_MONEY = OKB / 100n; // 0.01 OKB for each owner and guardian
const KEEPER_FUNDS = (OKB * 2n) / 100n; // 0.02 OKB, what apps/backend/README.md asks for
const USDT0_AMOUNT = 1_000_000n; // 1.00 USD₮0 (6 decimals)
const WOKB_AMOUNT = OKB / 1000n; // 0.001 WOKB
const wokbAbi = parseAbi(['function deposit() payable']);

type Role = 'owner' | 'heir' | 'guardian' | 'new wallet' | 'keeper';

interface TxRow {
  drill: string;
  role: Role;
  signer: Address;
  action: string;
  hash: Hex;
  block: bigint;
  /** Block timestamp (chain time). */
  at: bigint;
  chainTime: string;
  gasUsed: bigint;
  forkGasPrice: bigint;
  /** gasUsed × the mainnet gas price read at the start. */
  mainnetCostWei: bigint;
  mainnetCostOkb: string;
}

interface TickRow {
  drill: string;
  tick: number;
  /** Chain time of the head after the tick. */
  at: bigint;
  chainTime: string;
  head: bigint;
  indexed: { from: bigint; to: bigint; created: number; events: number } | null;
  keeper: { due: number; sent: number };
  wallMs: number;
  errors: string[];
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface Timeline {
  drill: string;
  vault: Address;
  timing: { period: number; threshold: number; window: number } | null;
  start: 'createVault' | 'first keeper tick';
  startAt: bigint;
  lateAt: bigint;
  alarmAt: bigint | null;
  windowEndsAt: bigint | null;
  releasedAt: bigint | null;
  paidAt: bigint | null;
  expiresAt: bigint | null;
  finalState: StateName;
  /** Seconds from startAt to each step (chain time). */
  secondsAfterStart: Record<string, number>;
}

const iso = (t: bigint) => new Date(Number(t) * 1000).toISOString();

function parseTiming(raw: string, flag: string): { period: number; threshold: number; window: number } {
  const parts = raw.split(',').map((x) => Number(x.trim()));
  if (parts.length !== 3 || parts.some((x) => !Number.isSafeInteger(x) || x <= 0)) {
    throw new Error(
      `${flag} takes period,threshold,window: the period and the window in seconds, the threshold in missed periods, such as 60,2,120`,
    );
  }
  const [period, threshold, window] = parts;
  return { period, threshold, window };
}

/** A fresh random address: no key exists for it anywhere, so on the fork it can only send when impersonated. */
function freshAddress(): Address {
  return getAddress(bytesToHex(crypto.getRandomValues(new Uint8Array(20))));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'fork-url': { type: 'string', default: DEFAULT_UPSTREAM },
      'a-timing': { type: 'string', default: '60,2,120' },
      'b-timing': { type: 'string', default: '86400,1,120' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0]);
    return;
  }
  const upstream = assertUpstream(values['fork-url'] as string);
  const aTiming = parseTiming(values['a-timing'] as string, '--a-timing');
  const bTiming = parseTiming(values['b-timing'] as string, '--b-timing');

  // Read-only calls to X Layer: the gate is never verified, so guardFetch lets only reads through.
  const readGate: Gate = { url: upstream, verified: false };
  const upstreamCall = jsonRpc(upstream, guardFetch(readGate));
  const upChain = Number(await upstreamCall('eth_chainId'));
  if (upChain !== XLAYER_CHAIN_ID) throw new Error(`--fork-url reports chain ${upChain}, not ${XLAYER_CHAIN_ID}`);
  const upHead = (await upstreamCall('eth_getBlockByNumber', ['latest', false])) as {
    number: Hex;
    timestamp: Hex;
  };
  const mainnet = {
    block: BigInt(upHead.number),
    time: iso(BigInt(upHead.timestamp)),
    gasPrice: BigInt((await upstreamCall('eth_gasPrice')) as Hex),
  };
  console.log(`X Layer head ${mainnet.block} (${mainnet.time}), gas price ${mainnet.gasPrice} wei`);

  const anvil = await startAnvil({ forkUrl: upstream });
  let report: Awaited<ReturnType<typeof rehearse>>;
  try {
    report = await rehearse(anvil.url, upstream, mainnet, aTiming, bTiming);
  } finally {
    await anvil.stop();
  }
  const text = stringify({ schema: 'atropyle.drill-rehearsal/1', upstream, mainnet, ...report }, 2);
  if (values.out) writeFileSync(values.out, `${text}\n`);
  printSummary(report);
  if (values.out) console.log(`report written to ${values.out}`);
  const failed = report.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`${failed.length} check(s) failed: ${failed.map((c) => c.name).join(', ')}`);
    process.exitCode = 1;
  }
}

/** One JSON-RPC call through the given (guarded) fetch. */
function jsonRpc(url: string, f: Fetch) {
  return async (method: string, params: unknown[] = []): Promise<unknown> => {
    const res = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  };
}

async function rehearse(
  anvilUrl: string,
  upstream: string,
  mainnet: { block: bigint; time: string; gasPrice: bigint },
  aTiming: { period: number; threshold: number; window: number },
  bTiming: { period: number; threshold: number; window: number },
) {
  // ---------------------------------------------------------------- the gate
  const gate: Gate = { url: assertLoopbackRpc(anvilUrl), verified: false };
  const guarded = guardFetch(gate);
  const node = jsonRpc(gate.url, guarded);
  const fork = assertFreshAnvilFork(
    {
      clientVersion: await node('web3_clientVersion'),
      nodeInfo: await node('anvil_nodeInfo'),
      chainId: await node('eth_chainId'),
      blockNumber: await node('eth_blockNumber'),
    },
    upstream,
  );
  gate.verified = true;
  console.log(`anvil fork of ${fork.forkUrl} at block ${fork.forkBlock} on ${gate.url}, chain ${XLAYER_CHAIN_ID}`);

  // The production read transport (the SDK's httpTransport: batches of 3, retries) over the guarded fetch. Fork
  // reads of cold state go upstream, so the timeout is longer than production's 20 s.
  const transport: Transport = http(gate.url, {
    batch: { batchSize: 3, wait: 0 }, // MAX_BATCH of packages/sdk/src/transports.ts
    retryCount: 3,
    retryDelay: 400,
    timeout: 60_000,
    fetchFn: guarded,
  });
  const raw = JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8')) as Record<string, unknown>;
  const deployment = parseDeployment({ ...raw, rpcUrls: [gate.url], quorumRpcUrls: [[gate.url]] });
  const atro: AtropyleClient = createAtropyle({ chain: deployment, transport, verifyTransports: [transport] });
  const USDT0 = deployment.feeTokens[0];
  const walletOf = (account: Address): WalletClient => createWalletClient({ account, chain: atro.chain, transport });

  const txs: TxRow[] = [];
  const ticks: TickRow[] = [];
  const checks: Check[] = [];
  const timelines: Timeline[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  };

  const record = async (drill: string, role: Role, signer: Address, action: string, hash: Hex) => {
    const r = await atro.publicClient.getTransactionReceipt({ hash });
    const b = await atro.publicClient.getBlock({ blockNumber: r.blockNumber });
    const cost = r.gasUsed * mainnet.gasPrice;
    txs.push({
      drill,
      role,
      signer: getAddress(r.from),
      action,
      hash,
      block: r.blockNumber,
      at: b.timestamp,
      chainTime: iso(b.timestamp),
      gasUsed: r.gasUsed,
      forkGasPrice: r.effectiveGasPrice,
      mainnetCostWei: cost,
      mainnetCostOkb: formatEther(cost),
    });
    if (getAddress(r.from) !== signer) throw new Error(`${hash} was sent by ${r.from}, expected ${signer}`);
    if (r.status !== 'success') throw new Error(`${drill} ${action} ${hash} reverted`);
    return b.timestamp;
  };

  /** Impersonates a fresh address on the fork and gives it `wei` of native OKB. */
  const actor = async (wei: bigint): Promise<Address> => {
    const a = freshAddress();
    const code = await atro.publicClient.getCode({ address: a });
    if (code && code !== '0x') throw new Error(`${a} has code on the fork`);
    await node('anvil_impersonateAccount', [a]);
    if (wei > 0n) await node('anvil_setBalance', [a, toHex(wei)]);
    return a;
  };
  /** An address that only receives: never impersonated, never funded, so it cannot send anything on the fork. */
  const passive = async (): Promise<Address> => {
    const a = freshAddress();
    const code = await atro.publicClient.getCode({ address: a });
    if (code && code !== '0x') throw new Error(`${a} has code on the fork`);
    return a;
  };
  const balance20 = (token: Address, who: Address) =>
    atro.publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
  const nonce = (who: Address) => atro.publicClient.getTransactionCount({ address: who });

  /** Writes `amount` into `holder`'s balance slot of `token` on the fork (found by probing the usual layouts). */
  const slots = new Map<Address, (h: Address) => Hex>();
  const deal = async (token: Address, holder: Address, amount: bigint) => {
    const value = toHex(amount, { size: 32 });
    const ozNamespace = 0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00n; // ERC20Upgradeable v5
    const layouts: ((h: Address) => Hex)[] = [];
    const known = slots.get(token);
    if (known) layouts.push(known);
    for (const s of [...Array.from({ length: 200 }, (_, i) => BigInt(i)), ozNamespace]) {
      layouts.push((h) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [h, s])));
      layouts.push((h) => keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [s, h])));
    }
    for (const key of layouts) {
      const slot = key(holder);
      const before = (await node('eth_getStorageAt', [token, slot, 'latest'])) as Hex;
      await node('anvil_setStorageAt', [token, slot, value]);
      if ((await balance20(token, holder)) === amount) {
        slots.set(token, key);
        return;
      }
      await node('anvil_setStorageAt', [token, slot, toHex(BigInt(before), { size: 32 })]);
    }
    throw new Error(`no balance slot found for ${token}`);
  };

  // ---------------------------------------------------------------- the keeper, as a keeper-only deploy runs it
  const keeper = await actor(KEEPER_FUNDS);
  const db: TestDb = await testDb();
  const log = memoryLog();
  const config = testConfig({ opsEmail: null, resendApiKey: null, rpcUrls: [gate.url] });
  for (const k of ['budgetMs', 'maxBlocksPerRun', 'stepBlocks', 'keeperMaxTx', 'headMargin'] as const) {
    if (config[k] !== TICK_DEFAULTS[k]) throw new Error(`config.${k} differs from production`);
  }
  const d: Deps = {
    sql: db,
    chain: createSdkChain(atro, { wallet: walletOf(keeper) }),
    mailer: disabledMailer(),
    clock: systemClock,
    log,
    config,
    random: (size) => crypto.getRandomValues(new Uint8Array(size)),
    keeperError: null,
    defer: () => {},
  };
  let lastLogId = 0n;
  let tickNo = 0;

  /**
   * The cron: pg_cron starts the tick at second 0 of every minute and the function reads the head a moment later.
   * Chain time moves to TICK_LAG seconds past the next whole minute, the last blocks one second apart (X Layer makes
   * one block a second), then one runTick follows.
   */
  const passMinute = async () => {
    const now = (await atro.publicClient.getBlock()).timestamp;
    const target = (now / BigInt(CRON_SECONDS) + 1n) * BigInt(CRON_SECONDS) + TICK_LAG;
    const blocks = BigInt(config.headMargin + 1);
    const jump = target - now - blocks;
    if (jump > 0n) await node('evm_increaseTime', [Number(jump)]);
    await node('anvil_mine', [toHex(blocks), toHex(1)]);
  };
  const tick = async (drill: string): Promise<TickResult> => {
    const t0 = Date.now();
    const r = await runTick(d);
    const head = await atro.publicClient.getBlock();
    ticks.push({
      drill,
      tick: ++tickNo,
      at: head.timestamp,
      chainTime: iso(head.timestamp),
      head: head.number,
      indexed: r.indexer
        ? { from: r.indexer.from, to: r.indexer.to, created: r.indexer.created, events: r.indexer.events }
        : null,
      keeper: { due: r.keeper?.due ?? 0, sent: r.keeper?.sent ?? 0 },
      wallMs: Date.now() - t0,
      errors: r.errors,
    });
    if (r.errors.length > 0) console.log(`tick ${tickNo} errors: ${r.errors.join('; ')}`);
    const rows = await db.query<{ id: string; vault: string; action: string | null; status: string; tx_hash: string }>(
      'select id::text as id, vault, action, status, tx_hash from public.keeper_log where id > $1::bigint order by id',
      [lastLogId.toString()],
    );
    for (const row of rows) {
      lastLogId = BigInt(row.id);
      if (row.status !== 'sent' || row.tx_hash === null) {
        check(`${drill}: keeper attempt`, false, `${row.action} on ${row.vault}: ${row.status}`);
        continue;
      }
      await record(drill, 'keeper', keeper, row.action ?? 'unknown', row.tx_hash as Hex);
      console.log(`tick ${tickNo}: keeper sent ${row.action} to ${getAddress(row.vault)}`);
    }
    return r;
  };
  const keeperTxs = (drill: string) => txs.filter((t) => t.drill === drill && t.role === 'keeper');
  /** Ticks once a minute until `done`, for at most `max` ticks. */
  const cronUntil = async (drill: string, done: () => Promise<boolean>, max: number) => {
    for (let i = 0; i < max; i++) {
      if (await done()) return true;
      await passMinute();
      await tick(drill);
    }
    return done();
  };
  const sendPlan = async (drill: string, role: Role, signer: Address, plan: TxPlan) => {
    const sent = await atro.send(plan, walletOf(signer));
    let first: bigint | null = null;
    for (const s of sent.steps) {
      const at = await record(drill, role, signer, s.action, s.hash);
      first ??= at;
    }
    return first as bigint;
  };

  // ---------------------------------------------------------------- 0. first tick and the old Drill
  {
    const drill = 'old Drill';
    const s = await atro.vault(OLD_DRILL).status();
    console.log(`old Drill ${OLD_DRILL}: ${s.state}, pending ${s.pending}, expires ${iso(s.expiresAt ?? 0n)}`);
    // What the keeper has left to do depends on the fork block: after the real deploy, the real keeper has already
    // poked the old Drill on mainnet, or released it, and from 29 Nov 08:28:06 UTC it has expired.
    const want = oldDrillExpectation(s);
    // The first tick after a deploy starts at factoryBlock, exactly like production: the old Drill was created 16
    // blocks after the factory, so the very first tick indexes it, and its keeper phase pokes it if anything is due.
    // pg_cron starts it on a whole minute, like every later tick.
    await passMinute();
    const first = await tick(drill);
    const firstAt = ticks[ticks.length - 1].at;
    check(
      'first tick indexes the old Drill',
      (first.indexer?.created ?? 0) === 1 && first.indexer?.from === deployment.factoryBlock,
      `indexed blocks ${first.indexer?.from}..${first.indexer?.to} (${first.indexer?.created} vault) in ${ticks.at(-1)?.wallMs} ms`,
    );
    // The rest of the backfill (factoryBlock to the fork block) is the 4-5 hours a real deploy spends catching up.
    // The rehearsal jumps the cursor to the fork block instead.
    await setCursor(db, fork.forkBlock, new Date().toISOString());
    if (want.keeperTxs === 0) {
      // Nothing is due: one more tick shows that the keeper still sends nothing.
      await passMinute();
      await tick(drill);
    } else {
      await cronUntil(drill, async () => isReleased((await atro.vault(OLD_DRILL).status()).state), OLD_DRILL_TICKS);
    }
    const end = await atro.vault(OLD_DRILL).status();
    const kt = keeperTxs(drill);
    check(
      want.check,
      kt.length === want.keeperTxs && (want.ends === 'released' ? isReleased(end.state) : end.state === s.state),
      `${s.state} (pending ${s.pending}) -> ${end.state}; keeper sent ${kt.length} tx (${kt.map((t) => t.action).join(', ') || 'none'}), expected ${want.keeperTxs}`,
    );
    if (kt.length > 0) {
      timelines.push(timelineOf(drill, OLD_DRILL, null, 'first keeper tick', firstAt, end, kt.at(-1)?.at ?? null));
    }
  }

  // ---------------------------------------------------------------- A. inheritance
  {
    const drill = 'Drill A';
    const owner = await actor(GAS_MONEY);
    const heir = await passive();
    await deal(USDT0, owner, USDT0_AMOUNT);
    const plan: PlanInput = atro.plan.template('simple', {
      drill: true,
      heirs: [{ account: heir }],
      timing: aTiming,
      assets: [{ kind: 'erc20', token: USDT0 }],
    });
    const prepared = await atro.prepare.createVault(plan, { owner, drill: true });
    const vault = prepared.vault;
    const createdAt = await sendPlan(drill, 'owner', owner, prepared);
    const s0 = await atro.vault(vault).status();
    console.log(`${drill} ${vault}: created ${iso(createdAt)}, late at ${iso(s0.lateAt)}; the owner goes silent`);
    const ticksNeeded = Math.ceil((aTiming.period * aTiming.threshold + aTiming.window) / CRON_SECONDS) + 5;
    const paid = await cronUntil(drill, async () => (await balance20(USDT0, heir)) === USDT0_AMOUNT, ticksNeeded);
    const end = await atro.vault(vault).status();
    const kt = keeperTxs(drill);
    const ownerTxs = txs.filter((t) => t.drill === drill && t.role === 'owner');
    check(
      `${drill}: the heir received the asset`,
      paid && end.state === 'releasedInherit',
      `heir ${heir} holds ${formatUnits(await balance20(USDT0, heir), 6)} USD₮0, vault ${end.state}`,
    );
    check(
      `${drill}: the heir signed nothing`,
      (await nonce(heir)) === 0 && (await atro.publicClient.getBalance({ address: heir })) === 0n,
      `heir nonce ${await nonce(heir)}, OKB balance 0, never impersonated`,
    );
    check(
      `${drill}: the keeper raised the alarm and paid`,
      kt.map((t) => t.action).join(',') === 'poke,distribute' && ownerTxs.every((t) => t.at < s0.lateAt),
      `keeper sent ${kt.map((t) => t.action).join(', ')}; the owner signed ${ownerTxs.map((t) => t.action).join(', ')}, all before lateAt`,
    );
    timelines.push(timelineOf(drill, vault, aTiming, 'createVault', createdAt, end, kt.at(-1)?.at ?? null));
  }

  // ---------------------------------------------------------------- B. recovery
  {
    const drill = 'Drill B';
    const owner = await actor(GAS_MONEY);
    const heir = await passive();
    const g1 = await actor(GAS_MONEY);
    const g2 = await actor(GAS_MONEY);
    const g3 = await passive();
    const target = await passive();
    await deal(USDT0, owner, USDT0_AMOUNT);
    const wrap = await walletOf(owner).sendTransaction({
      account: owner,
      chain: atro.chain,
      to: WOKB,
      value: WOKB_AMOUNT,
      data: encodeFunctionData({ abi: wokbAbi, functionName: 'deposit' }),
    });
    await atro.publicClient.waitForTransactionReceipt({ hash: wrap });
    await record(drill, 'owner', owner, 'wrap OKB (WOKB.deposit)', wrap);
    const plan: PlanInput = atro.plan.template('guarded', {
      drill: true,
      heirs: [{ account: heir }],
      guardians: [g1, g2, g3],
      k: 2,
      recoveryEnabled: true,
      timing: bTiming,
      assets: [
        { kind: 'erc20', token: USDT0 },
        { kind: 'erc20', token: WOKB },
      ],
    });
    const prepared = await atro.prepare.createVault(plan, { owner, drill: true });
    const vault = prepared.vault;
    const createdAt = await sendPlan(drill, 'owner', owner, prepared);
    console.log(`${drill} ${vault}: created ${iso(createdAt)}; guardians ${g1}, ${g2}, ${g3}`);
    await passMinute();
    await tick(drill);
    const vote = async (g: Address) => {
      const p = await atro.vault(vault).prepare({ type: 'voteRecovery', target }, { as: g });
      return sendPlan(drill, 'guardian', g, p);
    };
    const firstVote = await vote(g1);
    await passMinute();
    await tick(drill);
    const afterOne = await atro.vault(vault).status();
    check(`${drill}: one vote changes nothing`, afterOne.state === 'active', `state ${afterOne.state}`);
    await vote(g2);
    const alarmed = await atro.vault(vault).status();
    check(
      `${drill}: the second vote raised the recovery alarm`,
      alarmed.state === 'recovery' && alarmed.recoveryTarget === target,
      `state ${alarmed.state}, target ${alarmed.recoveryTarget}, window ends ${iso(alarmed.windowEndsAt ?? 0n)}`,
    );
    const paid = await cronUntil(
      drill,
      async () => (await balance20(USDT0, target)) === USDT0_AMOUNT && (await balance20(WOKB, target)) === WOKB_AMOUNT,
      Math.ceil(bTiming.window / CRON_SECONDS) + 5,
    );
    const end = await atro.vault(vault).status();
    const kt = keeperTxs(drill);
    check(
      `${drill}: the new wallet received every asset`,
      paid && end.state === 'releasedRecover',
      `new wallet ${target} holds ${formatUnits(await balance20(USDT0, target), 6)} USD₮0 and ${formatEther(await balance20(WOKB, target))} WOKB, vault ${end.state}`,
    );
    check(
      `${drill}: heir, third guardian and new wallet signed nothing`,
      (await nonce(target)) === 0 &&
        (await nonce(heir)) === 0 &&
        (await nonce(g3)) === 0 &&
        (await balance20(USDT0, heir)) === 0n,
      'nonce 0 for all three; the heir received nothing',
    );
    check(
      `${drill}: the keeper released and paid in one transaction`,
      kt.map((t) => t.action).join(',') === 'distribute',
      `keeper sent ${kt.map((t) => t.action).join(', ')}`,
    );
    const tl = timelineOf(drill, vault, bTiming, 'createVault', createdAt, end, kt.at(-1)?.at ?? null);
    tl.secondsAfterStart.firstVote = Number(firstVote - createdAt);
    tl.secondsAfterStart.secondVote = Number((alarmed.alarmAt ?? 0n) - createdAt);
    timelines.push(tl);
  }

  const errors = log.lines.filter((l) => l.level === 'error');
  check('the backend logged no error', errors.length === 0, `${errors.length} error line(s)`);
  check(
    'every tick finished without a phase error',
    ticks.every((t) => t.errors.length === 0),
    `${ticks.length} ticks`,
  );
  const keeperSpent = KEEPER_FUNDS - (await atro.publicClient.getBalance({ address: keeper }));
  await db.close();
  return {
    fork: { block: fork.forkBlock, rpc: gate.url, chainId: XLAYER_CHAIN_ID },
    keeper: {
      address: keeper,
      spentOnForkWei: keeperSpent,
      txs: txs.filter((t) => t.role === 'keeper').length,
      mainnetCostWei: txs.filter((t) => t.role === 'keeper').reduce((a, t) => a + t.mainnetCostWei, 0n),
    },
    timing: { a: aTiming, b: bTiming },
    txs,
    ticks,
    timelines,
    checks,
  };
}

const isReleased = (s: StateName) => s === 'releasedInherit' || s === 'releasedRecover';

/**
 * Chain times of one Drill, from its final status, counted from `startAt` (the createVault block, or the first keeper
 * tick for the old Drill). `paidAt` is the chain time of the keeper's last transaction.
 */
function timelineOf(
  drill: string,
  vault: Address,
  timing: Timeline['timing'],
  start: Timeline['start'],
  startAt: bigint,
  s: VaultStatus,
  paidAt: bigint | null,
): Timeline {
  const t: Timeline = {
    drill,
    vault,
    timing,
    start,
    startAt,
    lateAt: s.lateAt,
    alarmAt: s.alarmAt,
    windowEndsAt: s.windowEndsAt,
    releasedAt: s.releasedAt,
    paidAt,
    expiresAt: s.expiresAt,
    finalState: s.state,
    secondsAfterStart: {},
  };
  for (const [k, v] of Object.entries({
    lateAt: s.lateAt,
    alarmAt: s.alarmAt,
    windowEndsAt: s.windowEndsAt,
    releasedAt: s.releasedAt,
    paidAt,
  })) {
    if (v !== null) t.secondsAfterStart[k] = Number(v - startAt);
  }
  return t;
}

function printSummary(r: Awaited<ReturnType<typeof rehearse>>): void {
  console.log('\ntransactions (gas on the fork; OKB at the mainnet gas price read at the start):');
  for (const t of r.txs) {
    console.log(
      `  ${t.drill.padEnd(9)} ${t.role.padEnd(8)} ${t.action.padEnd(24)} gas ${String(t.gasUsed).padStart(8)}  ${t.mainnetCostOkb} OKB`,
    );
  }
  console.log('\ntimelines (chain seconds after createVault; after the first keeper tick for the old Drill):');
  for (const t of r.timelines) console.log(`  ${t.drill}: ${JSON.stringify(t.secondsAfterStart)} -> ${t.finalState}`);
  console.log(
    `\nkeeper: ${r.keeper.txs} transactions, ${formatEther(r.keeper.mainnetCostWei)} OKB at the mainnet gas price`,
  );
  const failed = r.checks.filter((c) => !c.ok).length;
  console.log(`checks: ${r.checks.length - failed} passed, ${failed} failed`);
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
});
