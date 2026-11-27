// @vitest-environment happy-dom
import { deploymentToJson, VERSION } from '@atropyle/sdk';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import circuits from '../../../../circuits/package.json';
import cli from '../../../../packages/cli/package.json';
import mcp from '../../../../packages/mcp/package.json';
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
  expect(cmd('verify')).toBe(`npx -y atropyle@${VERSION} verify`);
  expect(cmd('mcp')).toBe(`claude mcp add atropyle -- npx -y @atropyle/mcp@${VERSION}`);
  expect(cmd('mcpAny')).toBe(`npx -y @atropyle/mcp@${VERSION}`);
  expect(cmd('plugin')).toBe('/plugin marketplace add duongnq2798/atropyle\n/plugin install atropyle@atropyle');
  expect(cmd('skills')).toBe('npx skills add duongnq2798/atropyle');
  expect(screen.getByTestId('developers-docs').getAttribute('href')).toBe(docsHome(null));
  expect(screen.getByTestId('developers-repo').getAttribute('href')).toBe('https://github.com/duongnq2798/atropyle');
  for (const p of ['@atropyle/sdk', 'atropyle', '@atropyle/mcp', '@atropyle/circuits']) {
    expect(screen.getByTestId(`developers-npm-${p}`).getAttribute('href')).toBe(`https://www.npmjs.com/package/${p}`);
  }
  expect(screen.getByTestId('developers-address-factory').textContent).toContain(d.factory);
  expect(screen.getByTestId('developers-address-cpu').textContent).toContain(d.cpu);
  // D12: the page names the version that is on npm, and gives no unsourced Windows advice.
  expect(screen.getByTestId('developers-published').textContent).toBe(`Version ${VERSION} of each package is on npm.`);
  expect(document.body.textContent).not.toContain('cmd /c');
});

test('the four packages share the SDK version that pins the commands and the published line', () => {
  // The SDK's own package.json is checked against VERSION in packages/sdk/test/unit/surface.test.ts.
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(circuits.version).toBe(VERSION);
  expect(cli.version).toBe(VERSION);
  expect(mcp.version).toBe(VERSION);
});
