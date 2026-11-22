// @vitest-environment happy-dom
import { deploymentToJson } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app';
import { readEnv } from '../../src/env';
import { memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { fixtureDeployment } from './fixtures';

afterEach(cleanup);

const json = JSON.stringify(deploymentToJson(fixtureDeployment({ name: 'local', chainId: 31337 })));

describe('shell', () => {
  it('renders in English, switches to Vietnamese and remembers it', async () => {
    location.hash = '#/nope';
    const kv = memoryKV();
    const win = new EventTarget() as WalletWindow;
    render(<App env={readEnv({ VITE_DEPLOYMENT: json })} kv={kv} win={win} languages={['en-US']} />);
    expect(screen.getByTestId('beta').textContent).toBe('Beta — unaudited');
    expect(screen.getByText('Page not found')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lang'));
    expect(await screen.findByText('Beta — chưa kiểm toán')).toBeTruthy();
    expect(kv.get('atropyle:lang')).toBe('vi');
  });

  it('shows the deployment error when the deployment cannot be read', () => {
    location.hash = '#/';
    const win = new EventTarget() as WalletWindow;
    render(<App env={readEnv({ VITE_DEPLOYMENT: '{' })} kv={memoryKV()} win={win} languages={[]} />);
    expect(screen.getByTestId('sdk-error').getAttribute('data-code')).toBe('DEPLOYMENT_INVALID');
  });
});
