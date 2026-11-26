// @vitest-environment happy-dom
import { type AtropyleClient, deploymentToJson, type IntegrityReport } from '@atropyle/sdk';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import { readEnv } from '../../src/env';
import type { FetchFn } from '../../src/lib/health';
import { rpcPlan } from '../../src/lib/rpc';
import type { Sdk } from '../../src/lib/sdk';
import { saveStats } from '../../src/lib/stats-view';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import type { WalletWindow } from '../../src/lib/wallet';
import { StatusPage } from '../../src/pages/status';
import { AppProvider } from '../../src/ui/app-context';
import type { CountersLoad } from '../../src/ui/chain-counters';
import { fixtureCounters } from './counters-fixture';
import { DRPC, fixtureDeployment, fixtureStats, OKX } from './fixtures';

afterEach(cleanup);

const d = fixtureDeployment();
const REPORT: IntegrityReport = {
  ok: true,
  chainId: 196,
  blockNumber: 123n,
  blockTimestamp: 1_000n,
  rpcs: 2,
  checks: [{ name: 'factory.cpu', ok: true, expected: d.cpu, actual: d.cpu }],
  warnings: [],
};
const HEALTH = {
  schemaVersion: 1,
  status: 'degraded',
  rpcs: [
    { url: OKX[0], ok: true, ms: 40 },
    { url: DRPC, ok: false, ms: null },
  ],
  lastCronAt: '2026-11-18T10:00:00.000Z',
  lastCronAgeSec: 30,
  cursorLagBlocks: 2,
  integrity: 'pass',
  keeper: { address: null, balance: null, dryRun: true },
};

/** integrity() is the only SDK call of the status page, so a fake client keeps the test off the network. */
function fakeSdk(target: 'pages' | 'deweb', report: IntegrityReport = REPORT): Sdk {
  return {
    atro: { integrity: async () => report } as unknown as AtropyleClient,
    deployment: d,
    rpc: rpcPlan(d, target, false),
  };
}

const probe = async (url: string): Promise<bigint> => {
  if (url === DRPC) throw new Error('down');
  return 123n;
};

function renderStatus(
  vars: Record<string, string>,
  sdk: Sdk,
  fetchFn: FetchFn,
  kv: KV = memoryKV(),
  counters: CountersLoad = async () => fixtureCounters(),
) {
  const env = readEnv({ VITE_DEPLOYMENT: JSON.stringify(deploymentToJson(d)), ...vars });
  render(
    <AppProvider env={env} kv={kv} win={new EventTarget() as WalletWindow} languages={['en']}>
      <StatusPage sdk={sdk} probe={probe} fetchFn={fetchFn} counters={counters} />
    </AppProvider>,
  );
  return kv;
}

test('the Pages copy checks the chain, probes every RPC and reads the Worker health', async () => {
  location.hash = '#/status?p=secret';
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(HEALTH), { status: 200 });
  };
  renderStatus({ VITE_WORKER_URL: 'https://w.example.workers.dev' }, fakeSdk('pages'), fetchFn);
  expect((await screen.findByTestId('status-integrity')).getAttribute('data-ok')).toBe('true');
  expect((await screen.findByTestId('status-rpc-2')).getAttribute('data-ok')).toBe('false');
  expect(screen.getByTestId('status-rpc-0').getAttribute('data-ok')).toBe('true');
  expect((await screen.findByTestId('status-worker')).getAttribute('data-status')).toBe('degraded');
  expect(screen.getByTestId('status-worker-integrity').getAttribute('data-value')).toBe('pass');
  expect(screen.getByTestId('status-worker-keeper').getAttribute('data-dry-run')).toBe('true');
  expect(calls.map((c) => c.url)).toEqual(['https://w.example.workers.dev/health']);
  expect(calls[0].init).toMatchObject({ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  expect(screen.queryByTestId('status-crosscheck')).toBeNull();
  const text = screen.getByTestId('status-diagnostics').textContent ?? '';
  expect(JSON.parse(text)).toMatchObject({
    app: '0.0.0',
    target: 'pages',
    chainId: 196,
    block: '123',
    crossCheck: false,
    lang: 'en',
    integrity: { ok: true, rpcs: 2, failed: [], warnings: [] },
  });
  expect(JSON.parse(text).rpcs).toHaveLength(3);
  expect(text).not.toContain('#');
  expect(text).not.toContain('secret');
});

test('the DeWEB copy never calls the Worker and offers the cross-check with a warning', async () => {
  let fetched = 0;
  const fetchFn: FetchFn = async () => {
    fetched += 1;
    return new Response(JSON.stringify(HEALTH), { status: 200 });
  };
  const kv = renderStatus(
    { VITE_TARGET: 'deweb', VITE_WORKER_URL: 'https://w.example.workers.dev' },
    fakeSdk('deweb'),
    fetchFn,
  );
  expect((await screen.findByTestId('status-integrity')).getAttribute('data-ok')).toBe('true');
  expect(screen.getByTestId('status-worker-off')).toBeTruthy();
  expect(screen.queryByTestId('status-worker')).toBeNull();
  expect(fetched).toBe(0);
  const box = screen.getByTestId('status-crosscheck') as HTMLInputElement;
  expect(box.checked).toBe(false);
  expect(screen.getByTestId('status-crosscheck-warning').textContent).toContain('100% on-chain');
  expect(screen.queryByTestId('status-offchain')).toBeNull();
  fireEvent.change(box, { target: { checked: true } });
  expect(kv.get(KEYS.crossCheck)).toBe('1');
  expect((screen.getByTestId('status-crosscheck') as HTMLInputElement).checked).toBe(true);
});

test('two warnings with the same code but different messages both show (A6)', async () => {
  const report: IntegrityReport = {
    ...REPORT,
    warnings: [
      { code: 'SINGLE_RPC', message: 'Only one RPC operator was used.' },
      { code: 'SINGLE_RPC', message: 'Only one RPC operator answered.' },
      { code: 'SINGLE_RPC', message: 'Only one RPC operator was used.' },
    ],
  };
  renderStatus({ VITE_WORKER_URL: 'https://w.example.workers.dev' }, fakeSdk('pages', report), async () => {
    return new Response(JSON.stringify(HEALTH), { status: 200 });
  });
  await screen.findByTestId('status-integrity');
  expect(screen.getAllByTestId('status-warning-SINGLE_RPC')).toHaveLength(2);
});

test('a failed Worker answer shows the error and the Pages build without a Worker URL says so', async () => {
  renderStatus({ VITE_WORKER_URL: 'https://w.example.workers.dev' }, fakeSdk('pages'), async () => {
    return new Response('{}', { status: 503 });
  });
  const err = await screen.findByTestId('error');
  expect(err.getAttribute('data-code')).toBe('UNKNOWN');
  expect(err.textContent).toContain('HTTP 503');
  cleanup();
  renderStatus({}, fakeSdk('pages'), async () => {
    throw new Error('must not be called');
  });
  expect(await screen.findByTestId('status-worker-none')).toBeTruthy();
});

test('the status page reads the chain counters on load, with how each one is counted', async () => {
  renderStatus({ VITE_TARGET: 'deweb' }, fakeSdk('deweb'), async () => new Response('{}', { status: 200 }));
  expect((await screen.findByTestId('counter-vaults')).getAttribute('data-value')).toBe('1234');
  expect(screen.getByTestId('counter-paid').getAttribute('data-outside')).toBe('38');
  expect(screen.getByTestId('counters-as-of').textContent).toContain('block 76825469, 2026-11-25 08:15 UTC');
  const defs = screen.getByTestId('counters-definitions');
  expect(defs.textContent).toContain('nonce minus one');
  expect(defs.textContent).toContain('deployments/team.json');
});

test('a full count cached on this device shows on the status page without a network call', async () => {
  // fakeSdk has no stats(): the panel reads the chain only when its button is pressed.
  const kv = memoryKV();
  saveStats(kv, d.chainId, d.factory, fixtureStats(), 1_000);
  renderStatus({ VITE_TARGET: 'deweb' }, fakeSdk('deweb'), async () => new Response('{}', { status: 200 }), kv);
  expect(screen.getByTestId('stat-vaults').getAttribute('data-value')).toBe('3');
  expect(screen.getByTestId('stat-drill').getAttribute('data-value')).toBe('2');
  expect(screen.getByText('As of block 2000.')).toBeTruthy();
  expect(screen.getByTestId('stats-load').textContent).toBe('Update from the chain');
  await screen.findByTestId('status-integrity');
});

test('the rest of the status page works when the counters cannot be read', async () => {
  const down: CountersLoad = async () => {
    throw new Error('rpc down');
  };
  renderStatus(
    { VITE_TARGET: 'deweb' },
    fakeSdk('deweb'),
    async () => new Response('{}', { status: 200 }),
    memoryKV(),
    down,
  );
  expect(await screen.findByTestId('counters-error')).toBeTruthy();
  expect((await screen.findByTestId('status-integrity')).getAttribute('data-ok')).toBe('true');
  expect(screen.queryByTestId('error')).toBeNull();
  expect(screen.getByTestId('stats-load').textContent).toBe('Count from the chain');
});

test('the integrity table gives Expected and Found equal columns and labels them for the stacked phone layout', async () => {
  const report: IntegrityReport = {
    ...REPORT,
    checks: [
      { name: 'factory.cpu', ok: true, expected: d.cpu, actual: d.cpu },
      { name: `factory.feeToken ${d.feeTokens[0]}`, ok: true, actual: '1000' },
    ],
  };
  renderStatus({ VITE_TARGET: 'deweb' }, fakeSdk('deweb', report), async () => new Response('{}', { status: 200 }));
  await screen.findByTestId('status-integrity');
  const table = screen.getByTestId('status-checks');
  expect(table.classList.contains('table-fixed')).toBe(true);
  expect(table.classList.contains('table-stack')).toBe(true);
  expect([...table.querySelectorAll('col')].map((c) => c.className)).toEqual([
    'col-check',
    'col-result',
    'col-value',
    'col-value',
  ]);
  const [cpu, fee] = [...table.querySelectorAll('tbody tr')];
  expect([...cpu.querySelectorAll('td[data-label]')].map((c) => c.getAttribute('data-label'))).toEqual([
    'Expected',
    'Found',
  ]);
  // Only the values break anywhere: the check name keeps its words whole.
  expect(cpu.querySelector('td')?.classList.contains('wrap-anywhere')).toBe(false);
  // A check without an expected value leaves an empty cell, which the phone layout hides.
  const [expected, found] = [...fee.querySelectorAll('td[data-label]')];
  expect(expected.childNodes.length).toBe(0);
  expect(found.textContent).toBe('1000');
});
