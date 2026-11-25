import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { menuSheet } from '../../src/shell/mobile-menu';
import { settingsPanel } from '../../src/shell/settings-menu';
import { useWarmOverlays } from '../../src/shell/warm-overlays';
import { connectSheet } from '../../src/wallet/connect-sheet-slot';
import { walletMenuPanel } from '../../src/wallet/wallet-menu';

/** The idle callbacks the page asked for, run by the test when it decides the page is idle. */
function idle() {
  const tasks = new Map<number, () => void>();
  let next = 1;
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((task: () => void) => {
      tasks.set(next, task);
      return next++;
    }),
  );
  vi.stubGlobal(
    'cancelIdleCallback',
    vi.fn((id: number) => tasks.delete(id)),
  );
  return {
    pending: () => tasks.size,
    run: () => {
      for (const [id, task] of tasks) {
        tasks.delete(id);
        task();
      }
    },
  };
}

function wide(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(min-width: 48rem)' && matches, media: query })),
  );
}

const spies = () => ({
  sheet: vi.spyOn(connectSheet, 'preload').mockImplementation(() => undefined),
  wallet: vi.spyOn(walletMenuPanel, 'preload').mockImplementation(() => undefined),
  settings: vi.spyOn(settingsPanel, 'preload').mockImplementation(() => undefined),
  menu: vi.spyOn(menuSheet, 'preload').mockImplementation(() => undefined),
});

afterEach(() => {
  // Unmount while the stubs are there: the hook cancels its idle callback on unmount.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useWarmOverlays', () => {
  it('loads the wallet sheet, the wallet menu and Menu once the page is idle, on a phone', () => {
    const page = idle();
    wide(false);
    const s = spies();
    renderHook(() => useWarmOverlays());
    // Nothing during hydration: the first load stays as the R23 budget counts it.
    expect(s.sheet).not.toHaveBeenCalled();
    expect(page.pending()).toBe(1);

    page.run();
    expect(s.sheet).toHaveBeenCalledTimes(1);
    expect(s.wallet).toHaveBeenCalledTimes(1);
    expect(s.menu).toHaveBeenCalledTimes(1);
    expect(s.settings).not.toHaveBeenCalled();
  });

  it('loads Settings instead of Menu from 48rem', () => {
    const page = idle();
    wide(true);
    const s = spies();
    renderHook(() => useWarmOverlays());
    page.run();
    expect(s.settings).toHaveBeenCalledTimes(1);
    expect(s.menu).not.toHaveBeenCalled();
  });

  it('asks for nothing once the page is gone before it was idle', () => {
    const page = idle();
    wide(false);
    const s = spies();
    renderHook(() => useWarmOverlays()).unmount();
    expect(page.pending()).toBe(0);
    page.run();
    expect(s.sheet).not.toHaveBeenCalled();
  });

  it('falls back to a timeout where the browser has no requestIdleCallback (Safari)', () => {
    vi.useFakeTimers();
    try {
      wide(false);
      const s = spies();
      // happy-dom, like Safari, has no requestIdleCallback.
      expect(typeof window.requestIdleCallback).toBe('undefined');
      renderHook(() => useWarmOverlays());
      expect(s.sheet).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_500);
      expect(s.sheet).toHaveBeenCalledTimes(1);
      expect(s.menu).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
