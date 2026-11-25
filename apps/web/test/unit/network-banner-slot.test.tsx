import { act, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryKV } from '../../src/lib/store';
import { NetworkBannerSlot, networkBanner } from '../../src/wallet/network-banner-slot';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders, TestProviders, testQueryClient } from '../helpers/render';
import { walletValue } from '../helpers/wallet';

const offline = () => Object.assign(new Error('Failed to fetch dynamically imported module'), { name: 'TypeError' });

function withWallet(ui: ReactElement, value: WalletValue) {
  const r = renderWithProviders(<WalletContext value={value}>{ui}</WalletContext>);
  return { ...r, update: (next: WalletValue) => r.rerender(<WalletContext value={next}>{ui}</WalletContext>) };
}

const onChain = (chainId: number): WalletValue => {
  const base = walletValue();
  if (!base.wallet) throw new Error('walletValue connects a wallet');
  return walletValue({ wallet: { ...base.wallet, chainId }, wrongChain: chainId !== 196 });
};

afterEach(() => vi.restoreAllMocks());

describe('NetworkBannerSlot', () => {
  it('prerenders an empty live region on every page, before any wallet connects', () => {
    const html = renderToString(
      <TestProviders kv={memoryKV()} queryClient={testQueryClient()}>
        <NetworkBannerSlot />
      </TestProviders>,
    );
    expect(html).toMatch(/^<div aria-live="polite"[^>]*><\/div>$/);
  });

  // First of the tests that load the banner: the chunk keeps its module for the rest of the file.
  it('loads the banner again when its chunk failed, once the browser is back online', async () => {
    const load = vi.spyOn(networkBanner, 'load').mockRejectedValueOnce(offline());
    withWallet(<NetworkBannerSlot />, onChain(1));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByTestId('network-banner')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByTestId('network-banner')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('brings the banner into that same live region, so a screen reader hears it', async () => {
    const r = withWallet(<NetworkBannerSlot />, onChain(196));
    const region = r.container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.childElementCount).toBe(0);

    r.update(onChain(1));
    const banner = await screen.findByTestId('network-banner');
    expect(r.container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region?.contains(banner)).toBe(true);
    expect(banner.textContent).toContain('Your wallet is on Ethereum.');

    r.update(onChain(196));
    await waitFor(() => expect(screen.queryByTestId('network-banner')).toBeNull());
    expect(r.container.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region?.childElementCount).toBe(0);
  });
});
