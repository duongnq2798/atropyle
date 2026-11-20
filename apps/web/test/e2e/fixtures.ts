import { type AtropyleClient, createAtropyle, type Deployment, parseDeployment } from '@atropyle/sdk';
import { test as base, expect } from '@playwright/test';
import type { Address } from 'viem';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil.ts';
import { offchain, recordRequests, routeRpcToAnvil } from './network.ts';
import { type E2EState, readState, resetChain } from './state.ts';
import { installWallet, type TestWallet, type WalletOptions } from './wallet.ts';

export const ANVIL: readonly Address[] = ANVIL_ACCOUNTS;

interface Fixtures {
  state: E2EState;
  /** Every URL the page requested, in order. */
  requests: string[];
  deployment: Deployment;
  atro: AtropyleClient;
  wallet: (o: Omit<WalletOptions, 'rpcUrl'>) => Promise<TestWallet>;
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright passes fixture dependencies as the first argument
  state: async ({}, use) => {
    await use(await resetChain(readState()));
  },
  deployment: async ({ state }, use) => {
    await use(parseDeployment(state.deployment));
  },
  atro: async ({ state, deployment }, use) => {
    const chain = { ...deployment, rpcUrls: [state.rpcUrl], quorumRpcUrls: [[state.rpcUrl]] };
    await use(createAtropyle({ chain, builderCode: null }));
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright passes fixture dependencies as the first argument
  requests: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, state, requests }, use) => {
    await routeRpcToAnvil(page, state.rpcUrl);
    recordRequests(page, requests);
    await use(page);
    expect(
      offchain(requests, new URL(state.siteUrl).origin),
      'requests that would break the 100% on-chain badge',
    ).toEqual([]);
  },
  wallet: async ({ page, state }, use) => {
    await use((o) => installWallet(page, { rpcUrl: state.rpcUrl, ...o }));
  },
});

export { expect };
