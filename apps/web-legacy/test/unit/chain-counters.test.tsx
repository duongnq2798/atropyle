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
import { ChainCountersCard, type CountersLoad } from '../../src/ui/chain-counters';
import { fixtureCounters } from './counters-fixture';
import { fixtureDeployment, fixtureStats } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment();
const env = readEnv({});

function sdkWith(counters: (o?: CountersOptions) => Promise<ChainCounters>): Sdk {
  return { atro: { counters } as unknown as AtropyleClient, deployment: d, rpc: rpcPlan(d, 'deweb', false) };
}

function show(sdk: Sdk, o: { load?: CountersLoad; detail?: boolean; languages?: string[]; kv?: KV } = {}): void {
  render(
    <AppProvider
      env={env}
      kv={o.kv ?? memoryKV()}
      win={new EventTarget() as WalletWindow}
      languages={o.languages ?? ['en']}
    >
      <ChainCountersCard sdk={sdk} detail={o.detail} load={o.load} />
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
  expect(asked).toEqual([{ vaults: fixtureStats().cursor.vaults.map((v) => v.vault) }]);
});

test('says which counts are lower bounds when not every vault was read', async () => {
  show(sdkWith(async () => fixtureCounters({ complete: false, read: 5, teamComplete: false })));
  const releases = await screen.findByTestId('counter-releases');
  expect(releases.getAttribute('data-lower-bound')).toBe('true');
  expect(releases.textContent).toContain('3 or more');
  expect(screen.getByTestId('counter-vaults').textContent).not.toContain('or more');
  expect(screen.getByTestId('counters-partial').textContent).toContain('the 5 of 1234 vaults');
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
