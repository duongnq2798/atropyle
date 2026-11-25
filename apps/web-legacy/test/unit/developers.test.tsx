// @vitest-environment happy-dom
import { deploymentToJson } from '@atropyle/sdk';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { readEnv } from '../../src/env';
import { docsHome } from '../../src/lib/links';
import { memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { DevelopersPage } from '../../src/pages/developers';
import { AppProvider } from '../../src/ui/app-context';
import { RequireSdk } from '../../src/ui/components';
import { fixtureDeployment } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment({ name: 'local', chainId: 31337 });

test('the developers page lists the install commands, the packages and the contract addresses', () => {
  const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)) });
  render(
    <AppProvider env={env} kv={memoryKV()} win={new EventTarget() as WalletWindow} languages={['en']}>
      <RequireSdk>{(sdk) => <DevelopersPage sdk={sdk} />}</RequireSdk>
    </AppProvider>,
  );
  const cmd = (id: string) => screen.getByTestId(`developers-cmd-${id}`).textContent;
  expect(cmd('sdk')).toBe('npm install @atropyle/sdk viem');
  expect(cmd('verify')).toBe('npx -y atropyle verify');
  expect(cmd('mcp')).toBe('claude mcp add atropyle -- npx -y atropyle mcp');
  expect(cmd('mcpAny')).toBe('npx -y @atropyle/mcp');
  expect(cmd('plugin')).toBe('/plugin marketplace add duongnq2798/atropyle\n/plugin install atropyle@atropyle');
  expect(cmd('skills')).toBe('npx skills add duongnq2798/atropyle');
  expect(screen.getByTestId('developers-docs').getAttribute('href')).toBe(docsHome(null));
  expect(screen.getByTestId('developers-repo').getAttribute('href')).toBe('https://github.com/duongnq2798/atropyle');
  expect(screen.getByTestId('developers-npm-@atropyle/sdk').getAttribute('href')).toBe(
    'https://www.npmjs.com/package/@atropyle/sdk',
  );
  expect(screen.getByTestId('developers-address-factory').textContent).toContain(d.factory);
  expect(screen.getByTestId('developers-address-cpu').textContent).toContain(d.cpu);
  // D12: the commands work only after the npm publish, and no unsourced Windows advice.
  expect(screen.getByTestId('developers-published').textContent).toBe(
    'These commands work once the packages are published to npm.',
  );
  expect(document.body.textContent).not.toContain('cmd /c');
});
