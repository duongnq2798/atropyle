// @vitest-environment happy-dom
import { type AtropyleClient, AtropyleError, type ChainCounters, type CountersOptions } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { readEnv } from '../../src/env';
import { rpcPlan } from '../../src/lib/rpc';
import type { Sdk } from '../../src/lib/sdk';
import { saveStats } from '../../src/lib/stats-view';
import { type KV, memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { AppProvider } from '../../src/ui/app-context';
import { ChainCountersCard, type CountersLoad, HOME_MAX_VAULTS, STATUS_MAX_VAULTS } from '../../src/ui/chain-counters';
import { fixtureCounters } from './counters-fixture';
import { fixtureDeployment, fixtureStats } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment();
const env = readEnv({});

function sdkWith(counters: (o?: CountersOptions) => Promise<ChainCounters>): Sdk {
  return { atro: { counters } as unknown as AtropyleClient, deployment: d, rpc: rpcPlan(d, 'deweb', false) };
}

function show(
  sdk: Sdk,
  o: { load?: CountersLoad; detail?: boolean; maxVaults?: number; languages?: string[]; kv?: KV } = {},
): void {
  render(
    <AppProvider
      env={env}
      kv={o.kv ?? memoryKV()}
      win={new EventTarget() as WalletWindow}
      languages={o.languages ?? ['en']}
    >
      <ChainCountersCard sdk={sdk} detail={o.detail} maxVaults={o.maxVaults} load={o.load} />
    </AppProvider>,
  );
}

test('shows each counter with its share outside the team, and the block and UTC time of the read', async () => {
  show(sdkWith(async () => fixtureCounters()));
  expect(screen.getByText('Reading the counters from the chain…')).toBeTruthy();
  const vaults = await screen.findByTestId('counter-vaults');
  expect(vaults.getAttribute('data-value')).toBe('1234');
  expect(vaults.getAttribute('data-outside')).toBe('1200');
  expect(vaults.textContent).toContain('1,234');
  expect(vaults.textContent).toContain('1,200 outside the team');
  expect(screen.getByTestId('counter-paid').getAttribute('data-value')).toBe('40');
  expect(screen.getByTestId('counter-releases').getAttribute('data-value')).toBe('3');
  expect(screen.getByTestId('counter-stablecoins').textContent).toContain('$12,345.67');
  expect(screen.getByTestId('counters-as-of').textContent).toBe(
    'Read from the factory and vault contracts at block 76825469, 2026-11-25 08:15 UTC.',
  );
  expect(screen.queryByTestId('counters-partial')).toBeNull();
  expect(screen.queryByTestId('counters-definitions')).toBeNull();
  expect(screen.getByTestId('counters').getAttribute('data-status')).toBe('ok');
});

test('passes the vaults of a cached full count to the SDK, so releases can be exact', async () => {
  const kv = memoryKV();
  saveStats(kv, d.chainId, d.factory, fixtureStats(), 1_000);
  const asked: (CountersOptions | undefined)[] = [];
  show(
    sdkWith(async (o) => {
      asked.push(o);
      return fixtureCounters();
    }),
    { kv },
  );
  await screen.findByTestId('counter-vaults');
  const vaults = fixtureStats().cursor.vaults.map((v) => v.vault);
  expect(asked).toEqual([{ vaults, maxVaults: STATUS_MAX_VAULTS }]);
  cleanup();
  asked.length = 0;
  show(
    sdkWith(async (o) => {
      asked.push(o);
      return fixtureCounters();
    }),
    { kv, maxVaults: HOME_MAX_VAULTS },
  );
  await screen.findByTestId('counter-vaults');
  expect(asked).toEqual([{ vaults, maxVaults: 50 }]);
});

test('says which counts are lower bounds when not every vault was read', async () => {
  show(sdkWith(async () => fixtureCounters({ complete: false, read: 5, teamComplete: false })));
  const releases = await screen.findByTestId('counter-releases');
  expect(releases.getAttribute('data-lower-bound')).toBe('true');
  expect(releases.textContent).toContain('3 or more');
  expect(releases.textContent).toContain('Released vaults');
  expect(screen.getByTestId('counter-vaults').textContent).not.toContain('or more');
  expect(screen.getByTestId('counter-vaults').textContent).toContain('Vaults, free Drills included');
  const partial = screen.getByTestId('counters-partial');
  expect(partial.textContent).toContain('the 5 of 1234 vaults');
  expect(partial.textContent).toContain('Run the full count on the home page');
  expect(partial.getAttribute('data-capped')).toBe('false');
  expect(screen.getByTestId('counters-team-partial')).toBeTruthy();
});

test('at its cap the card says so, instead of asking for a full count that changes nothing', async () => {
  show(
    sdkWith(async () => fixtureCounters({ complete: false, read: 50 })),
    { maxVaults: HOME_MAX_VAULTS },
  );
  const partial = await screen.findByTestId('counters-partial');
  expect(partial.getAttribute('data-capped')).toBe('true');
  expect(partial.textContent).toBe(
    'Released vaults and stablecoins count the 50 of 1234 vaults this page read: it reads at most 50 vaults, so the true numbers may be higher.',
  );
  cleanup();
  // Every vault read, but the team index was not read to its end: no "N of N vaults" line, only the team one.
  show(sdkWith(async () => fixtureCounters({ complete: false, teamComplete: false })));
  await screen.findByTestId('counter-vaults');
  expect(screen.queryByTestId('counters-partial')).toBeNull();
  expect(screen.getByTestId('counters-team-partial')).toBeTruthy();
});

test('a failing RPC leaves one quiet line with a retry that reads again', async () => {
  let calls = 0;
  const load: CountersLoad = async () => {
    calls += 1;
    if (calls === 1) throw new AtropyleError('RPC_UNAVAILABLE', { message: 'down' });
    return fixtureCounters();
  };
  show(
    sdkWith(async () => fixtureCounters()),
    { load },
  );
  const error = await screen.findByTestId('counters-error');
  expect(error.textContent).toContain('The counters could not be read from the RPC right now.');
  expect(screen.queryByTestId('error')).toBeNull();
  fireEvent.click(screen.getByTestId('counters-retry'));
  expect((await screen.findByTestId('counter-vaults')).getAttribute('data-value')).toBe('1234');
  expect(calls).toBe(2);
});

test('the detailed view explains every number, in Vietnamese too', async () => {
  show(
    sdkWith(async () => fixtureCounters()),
    { detail: true },
  );
  const defs = await screen.findByTestId('counters-definitions');
  expect(defs.textContent).toContain('nonce minus one');
  expect(defs.textContent).toContain('factory.paidCount()');
  expect(defs.textContent).toContain('free Drills included, read as the factory’s account nonce');
  expect(defs.textContent).toContain('whether or not its sweep has run');
  expect(defs.textContent).toContain('one of the 2 addresses in deployments/team.json');
  cleanup();
  show(
    sdkWith(async () => fixtureCounters()),
    { detail: true, languages: ['vi'] },
  );
  expect((await screen.findByTestId('counter-vaults')).textContent).toContain('1,200 ngoài đội ngũ');
  expect(screen.getByTestId('counters-definitions').textContent).toContain('trừ một');
  expect(screen.getByTestId('counters-as-of').textContent).toContain('block 76825469, 2026-11-25 08:15 UTC');
});
