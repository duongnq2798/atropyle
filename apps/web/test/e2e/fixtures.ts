import { type AtropyleClient, createAtropyle, type Deployment, parseDeployment } from '@atropyle/sdk';
import { test as base, expect, type Page } from '@playwright/test';
import type { Address } from 'viem';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil.ts';
import { KEYS } from '../../src/lib/store.ts';
import type { E2ETheme } from './helpers.ts';
import { offchain, recordRequests, routeRpcToAnvil } from './network.ts';
import { type E2EState, readState, resetChain } from './state.ts';
import { installWallet, type TestWallet, type WalletOptions } from './wallet.ts';

export const ANVIL: readonly Address[] = ANVIL_ACCOUNTS;

export interface CspViolation {
  directive: string;
  blocked: string;
  sample: string;
}

/** Every securitypolicyviolation of every document the page loads, sent to Node as it happens. */
async function recordCspViolations(page: Page, out: CspViolation[]): Promise<void> {
  await page.exposeFunction('__atropyleCsp', (v: CspViolation) => {
    out.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as { __atropyleCsp(v: { directive: string; blocked: string; sample: string }): void };
      w.__atropyleCsp({ directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample });
    });
  });
}

interface Fixtures {
  state: E2EState;
  /** Every URL the page requested, in order. */
  requests: string[];
  /** Policy violations seen so far; a test that provokes one on purpose empties it (csp.spec.ts). */
  cspViolations: CspViolation[];
  deployment: Deployment;
  atro: AtropyleClient;
  wallet: (o: Omit<WalletOptions, 'rpcUrl'>) => Promise<TestWallet>;
}

interface Options {
  /**
   * The theme stored before the page's first load, when the test has stored none: the suite was written while night was
   * the default (7C-T12 Ruling 11). null leaves storage empty, for the tests of the default (theme-default.spec.ts).
   */
  firstTheme: E2ETheme | null;
}

export const test = base.extend<Fixtures & Options>({
  firstTheme: ['dark', { option: true }],
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
  // biome-ignore lint/correctness/noEmptyPattern: Playwright passes fixture dependencies as the first argument
  cspViolations: async ({}, use) => {
    await use([]);
  },
  // Three nets under every test: no request leaves the site and the OKX nodes, no policy violation, no uncaught error.
  page: async ({ page, state, requests, cspViolations, firstTheme }, use) => {
    if (firstTheme !== null) {
      await page.addInitScript(
        ([key, value]) => {
          try {
            if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
          } catch {
            // A document without storage (about:blank, a test that blocks it) gets the default.
          }
        },
        [KEYS.theme, firstTheme] as const,
      );
    }
    await routeRpcToAnvil(page, state.rpcUrl);
    recordRequests(page, requests);
    await recordCspViolations(page, cspViolations);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(
      offchain(requests, new URL(state.siteUrl).origin),
      'requests that would break the 100% on-chain badge',
    ).toEqual([]);
    expect(cspViolations, 'Content Security Policy violations').toEqual([]);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
  wallet: async ({ page, state }, use) => {
    await use((o) => installWallet(page, { rpcUrl: state.rpcUrl, ...o }));
  },
});

export { expect };
