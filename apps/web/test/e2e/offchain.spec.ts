import { expect, test } from '@playwright/test';
import { OKX_ORIGINS, offchain } from './network.ts';
import { readState } from './state.ts';

test('offchain() flags foreign and direct anvil requests and ignores site, OKX and inline URLs', () => {
  const state = readState();
  const site = new URL(state.siteUrl).origin;
  const okx = `${OKX_ORIGINS[0]}/`;
  expect(offchain([okx, `${site}/index.html`, 'data:text/plain,x', 'blob:null/1'], site)).toEqual([]);
  expect(offchain(['https://example.com/x', okx], site)).toEqual(['https://example.com/x']);
  expect(offchain([state.rpcUrl, state.rpcUrl], site)).toEqual([state.rpcUrl]);
});
