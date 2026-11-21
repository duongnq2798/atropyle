// @vitest-environment happy-dom
import { deploymentToJson } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { readEnv } from '../../src/env';
import { memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { CreatePage } from '../../src/pages/create';
import { AppProvider } from '../../src/ui/app-context';
import { RequireSdk } from '../../src/ui/components';
import { fixtureDeployment } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment({ name: 'local', chainId: 31337 });
const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)) });
const HEIR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const GUARDIAN = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

/** No wallet and no router: nothing in these tests reaches the network. */
function renderCreate(drill: boolean) {
  render(
    <AppProvider env={env} kv={memoryKV()} win={new EventTarget() as WalletWindow} languages={['en']}>
      <RequireSdk>{(sdk) => <CreatePage sdk={sdk} drill={drill} />}</RequireSdk>
    </AppProvider>,
  );
}

const active = (step: string) => screen.getByTestId(`create-step-${step}`).className;
const issue = (path: string) =>
  screen.getByTestId('create-issues').querySelector(`[data-path="${path}"]`)?.getAttribute('data-code');
const input = (id: string) => screen.getByTestId(id) as HTMLInputElement;

test('the Drill wizard checks each step before it moves on', () => {
  renderCreate(true);
  expect(active('template')).toBe('step-active');
  expect(input('create-template-simple').checked).toBe(true);
  fireEvent.click(screen.getByTestId('create-next'));

  expect(active('people')).toBe('step-active');
  expect(screen.queryByTestId('create-guardian-0')).toBeNull();
  fireEvent.input(input('create-heir-0-account'), { target: { value: '0x1234' } });
  fireEvent.click(screen.getByTestId('create-next'));
  expect(issue('heirs[0].account')).toBe('INVALID_ADDRESS');
  expect(active('people')).toBe('step-active');
  fireEvent.input(input('create-heir-0-account'), { target: { value: HEIR } });
  expect(screen.queryByTestId('create-issues')).toBeNull();
  fireEvent.click(screen.getByTestId('create-next'));

  expect(active('timing')).toBe('step-active');
  expect(input('create-preset-drill').checked).toBe(true);
  expect(screen.queryByTestId('create-preset-sixMonths')).toBeNull();
  fireEvent.click(screen.getByTestId('create-next'));

  expect(active('assets')).toBe('step-active');
  expect(screen.getByTestId('create-connect').textContent).toBe(
    'Connect a wallet to check the plan and create the vault.',
  );
  expect(screen.getByTestId('create-token-pick')).toBeTruthy();
  fireEvent.click(screen.getByTestId('create-add-circuit'));
  expect(input('create-asset-0-token').value).toBe(d.cpu);
  expect(input('create-asset-0-id').value).toBe('');
});

test('a real vault offers the 6- and 12-month presets and checks guardians and minimums', () => {
  renderCreate(false);
  expect(input('create-template-guarded').checked).toBe(true);
  fireEvent.click(screen.getByTestId('create-next'));
  fireEvent.input(input('create-heir-0-account'), { target: { value: HEIR } });
  fireEvent.click(screen.getByTestId('create-next'));
  expect(issue('guardians[0]')).toBe('INVALID_ADDRESS');
  expect(input('create-recovery').checked).toBe(false);
  fireEvent.input(input('create-guardian-0'), { target: { value: GUARDIAN } });
  fireEvent.click(screen.getByTestId('create-next'));

  expect(active('timing')).toBe('step-active');
  expect(input('create-preset-sixMonths').checked).toBe(true);
  expect(screen.getByTestId('create-preset-twelveMonths')).toBeTruthy();
  expect(screen.queryByTestId('create-preset-drill')).toBeNull();
  fireEvent.change(input('create-preset-custom'));
  expect(input('create-period').value).toBe('30d');
  fireEvent.input(input('create-period'), { target: { value: '1h' } });
  fireEvent.click(screen.getByTestId('create-next'));
  expect(issue('timing.period')).toBe('PERIOD_MIN');
  expect(active('timing')).toBe('step-active');

  fireEvent.click(screen.getByTestId('create-back'));
  expect(active('people')).toBe('step-active');
  expect(input('create-guardian-0').value).toBe(GUARDIAN);
});
