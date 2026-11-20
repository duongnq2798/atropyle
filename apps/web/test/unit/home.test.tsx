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
import { RequireSdk } from '../../src/ui/components';
import { fixtureDeployment, fixtureStats } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment({ name: 'local', chainId: 31337 });
const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)) });

/** No router: changing location.hash here does not render another page (and so never touches the network). */
function renderHome(kv: KV = memoryKV()) {
  render(
    <AppProvider env={env} kv={kv} win={new EventTarget() as WalletWindow} languages={['en']}>
      <RequireSdk>{(sdk) => <HomePage sdk={sdk} />}</RequireSdk>
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
