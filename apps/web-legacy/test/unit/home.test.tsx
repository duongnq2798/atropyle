// @vitest-environment happy-dom
import { deploymentToJson } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { readEnv } from '../../src/env';
import { saveStats } from '../../src/lib/stats-view';
import { type KV, memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { HomePage } from '../../src/pages/home';
import { AppProvider } from '../../src/ui/app-context';
import type { CountersLoad } from '../../src/ui/chain-counters';
import { RequireSdk } from '../../src/ui/components';
import { fixtureCounters } from './counters-fixture';
import { fixtureDeployment, fixtureStats } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment({ name: 'local', chainId: 31337 });
const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)) });

/**
 * No router: changing location.hash here does not render another page (and so never touches the network). The
 * counters come from `counters`, never from the RPC.
 */
function renderHome(
  kv: KV = memoryKV(),
  languages: string[] = ['en'],
  counters: CountersLoad = async () => fixtureCounters(),
) {
  render(
    <AppProvider env={env} kv={kv} win={new EventTarget() as WalletWindow} languages={languages}>
      <RequireSdk>{(sdk) => <HomePage sdk={sdk} counters={counters} />}</RequireSdk>
    </AppProvider>,
  );
}

test('the home page leads with the Drill and validates the vault address', async () => {
  location.hash = '#/';
  renderHome();
  expect(screen.getByTestId('home-drill').getAttribute('href')).toBe('#/create?drill=1');
  expect(screen.getByTestId('home-drill').textContent).toBe('Try a 5-minute Drill');
  const input = screen.getByTestId('home-open-input');
  fireEvent.input(input, { target: { value: 'not an address' } });
  fireEvent.submit(screen.getByTestId('home-open-form'));
  expect(await screen.findByText('That is not a valid address.')).toBeTruthy();
  fireEvent.input(input, { target: { value: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' } });
  fireEvent.submit(screen.getByTestId('home-open-form'));
  expect(location.hash).toBe('#/v/0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
});

test('cached stats show without a network call', () => {
  const kv = memoryKV();
  saveStats(kv, d.chainId, d.factory, fixtureStats(), 1_000);
  renderHome(kv);
  expect(screen.getByTestId('stat-vaults').getAttribute('data-value')).toBe('3');
  expect(screen.getByTestId('stat-drill').getAttribute('data-value')).toBe('2');
  expect(screen.getByText('As of block 2000.')).toBeTruthy();
  expect(screen.getByTestId('stats-load').textContent).toBe('Update from the chain');
  expect(screen.getByText('Connect a wallet to see the vaults you own, inherit or guard.')).toBeTruthy();
});

test('the tagline says what k is and how the owner stops a recovery, in both languages', () => {
  renderHome();
  const en = screen.getByTestId('home-tagline').textContent;
  expect(en).toContain('k of your guardians, a number you choose,');
  expect(en).toContain('You can stop it only by checking in before the window ends.');
  cleanup();
  renderHome(memoryKV(), ['vi']);
  const vi = screen.getByTestId('home-tagline').textContent;
  expect(vi).toContain('k trong số người giám hộ của bạn, một con số do bạn chọn,');
  expect(vi).toContain('Bạn chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động.');
});

test('the home page reads the counters on load and shows the block and date of the read', async () => {
  renderHome();
  expect((await screen.findByTestId('counter-vaults')).getAttribute('data-value')).toBe('1234');
  expect(screen.getByTestId('counter-paid').getAttribute('data-outside')).toBe('38');
  expect(screen.getByTestId('counters-as-of').textContent).toContain('block 76825469, 2026-11-25 08:15 UTC');
  // The short version: the definitions stay on the status page.
  expect(screen.queryByTestId('counters-definitions')).toBeNull();
});

test('the rest of the home page works when the counters cannot be read', async () => {
  renderHome(memoryKV(), ['en'], async () => {
    throw new Error('rpc down');
  });
  expect(await screen.findByTestId('counters-error')).toBeTruthy();
  expect(screen.queryByTestId('error')).toBeNull();
  expect(screen.getByTestId('home-drill').getAttribute('href')).toBe('#/create?drill=1');
  expect(screen.getByTestId('stats-load')).toBeTruthy();
});
