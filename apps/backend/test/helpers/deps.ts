import { type FakeClock, fakeClock } from '../../src/clock';
import type { Config } from '../../src/config';
import type { Sql } from '../../src/db/sql';
import type { Deps } from '../../src/deps';
import { type MemoryLog, memoryLog } from '../../src/log';
import { type CaptureMailer, captureMailer } from '../../src/mail/mailer';
import { FakeChain } from './fake-chain';

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    siteUrl: 'https://atropyle.test',
    siteHost: 'atropyle.test',
    allowedOrigins: ['https://atropyle.test'],
    apiUrl: 'https://ref.supabase.co/functions/v1',
    mailFrom: 'Atropyle <alerts@atropyle.test>',
    tokenSecret: 't'.repeat(32),
    cronSecret: 'c'.repeat(32),
    opsEmail: 'ops@atropyle.test',
    resendApiKey: null,
    rpcUrls: null,
    headMargin: 3,
    budgetMs: 50_000,
    maxBlocksPerRun: 2_000,
    stepBlocks: 500,
    keeperMaxTx: 20,
    ...over,
  };
}

export interface TestEnv {
  d: Deps;
  chain: FakeChain;
  mailer: CaptureMailer;
  clock: FakeClock;
  log: MemoryLog;
}

/** Deps over a test database with a fake chain, a capturing mailer, a fake clock and a memory log. */
export function testEnv(sql: Sql, o: { config?: Partial<Config>; keeperError?: string | null } = {}): TestEnv {
  const chain = new FakeChain();
  const mailer = captureMailer();
  const clock = fakeClock();
  const log = memoryLog();
  let n = 0;
  // Distinct, deterministic bytes per call: tokens differ and tests stay reproducible.
  const random = (size: number) => {
    n++;
    return new Uint8Array(size).map((_, i) => (n * 31 + i) % 256);
  };
  const d: Deps = {
    sql,
    chain,
    mailer,
    clock,
    log,
    config: testConfig(o.config),
    random,
    keeperError: o.keeperError ?? null,
  };
  return { d, chain, mailer, clock, log };
}
