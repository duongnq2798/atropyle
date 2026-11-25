// @vitest-environment happy-dom
import { deploymentToJson } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, test, vi } from 'vitest';
import { readEnv } from '../../src/env';
import { memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { AppProvider } from '../../src/ui/app-context';
import { type GuardianFields, GuardiansEditor } from '../../src/ui/editors';
import { messages } from '../../src/ui/editors.messages';
import { fixtureDeployment } from './fixtures';

afterEach(cleanup);

const G = [
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
];

const d = fixtureDeployment({ name: 'local', chainId: 31337 });
const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)) });

function renderEditor(value: GuardianFields, onChange: (v: GuardianFields) => void = () => {}) {
  render(
    <AppProvider env={env} kv={memoryKV()} win={new EventTarget() as WalletWindow} languages={['en']}>
      <GuardiansEditor value={value} issues={[]} testid="g" onChange={onChange} />
    </AppProvider>,
  );
}

test('recovery is described as a power, right next to its checkbox', () => {
  renderEditor({ guardians: G, k: '', recoveryEnabled: false });
  const box = screen.getByTestId('g-recovery') as HTMLInputElement;
  expect(box.checked).toBe(false);
  const text = box.closest('label')?.textContent ?? '';
  expect(text).toContain(
    '2 guardians who agree can move everything in the vault to a wallet they choose. ' +
      'It is meant for your new wallet if you lose your key. You can stop it only by checking in before the window ends.',
  );
});

test('the power text names the typed k and the vi text keeps the placeholder', () => {
  renderEditor({ guardians: G, k: '3', recoveryEnabled: true });
  expect(screen.getByTestId('g-recovery').closest('label')?.textContent).toContain('3 guardians who agree');
  expect(messages.vi.recoveryPower).toContain('{k}');
});

test('ticking recovery reports it', () => {
  const onChange = vi.fn();
  renderEditor({ guardians: G, k: '', recoveryEnabled: false }, onChange);
  fireEvent.click(screen.getByTestId('g-recovery'));
  expect(onChange).toHaveBeenCalledWith({ guardians: G, k: '', recoveryEnabled: true });
});
