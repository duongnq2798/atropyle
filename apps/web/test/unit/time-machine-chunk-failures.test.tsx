import { DRILL_LIFETIME_SECONDS, evalStateOf, modelEngine } from '@atropyle/sdk';
import type { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHAIN_ID } from '../../src/chain/hooks';
import { chainKeys } from '../../src/chain/keys';
import type { Sdk } from '../../src/chain/types';
import { LazyTimeMachine } from '../../src/flows/time-machine/lazy';
import { renderWithProviders, testQueryClient } from '../helpers/render';
import { fixtureSnapshot } from './fixtures';

// The view chunk (lazy.tsx's import('./time-machine')) and the logic chunk (load.ts's import('../impl/time-machine'))
// each fail their next `fail` imports, as offline or after a deploy that replaced the hashed chunks. `imports` counts
// every try, so a test can tell which query a Retry ran again.
const chunks = vi.hoisted(() => ({ view: { imports: 0, fail: 0 }, impl: { imports: 0, fail: 0 } }));

async function gated(c: { imports: number; fail: number }, load: () => Promise<unknown>) {
  c.imports += 1;
  if (c.fail > 0) {
    c.fail -= 1;
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return load();
}

vi.mock('../../src/flows/time-machine/time-machine', (importOriginal) => gated(chunks.view, importOriginal));
vi.mock('../../src/flows/impl/time-machine', (importOriginal) => gated(chunks.impl, importOriginal));

const state = evalStateOf(fixtureSnapshot());
const END = 1_000n + BigInt(DRILL_LIFETIME_SECONDS);
const engine = modelEngine();

/** An SDK already in the cache, whose deployment engine is a spy that fails its first `fails` reads. */
function withSdk(fails = 0) {
  let left = fails;
  const read = vi.fn(async () => {
    if (left > 0) {
      left -= 1;
      throw new Error('rpc down');
    }
    return engine;
  });
  const queryClient = testQueryClient();
  queryClient.setQueryData(chainKeys.sdk(CHAIN_ID, false), { atro: { engine: read } } as unknown as Sdk);
  return { queryClient, read };
}

function renderLazy(queryClient: QueryClient) {
  return renderWithProviders(<LazyTimeMachine state={state} now={1_000n} expiresAt={END} drill binding={null} />, {
    lang: 'en',
    queryClient,
  });
}

/**
 * The error's box, once its ErrorBox has its Retry: the ErrorBox inside shows a skeleton with no testid until the
 * error decoder has loaded.
 */
const errorBox = async () => {
  await screen.findByTestId('time-machine-error-code', {}, { timeout: 15_000 });
  return screen.getByTestId('time-machine-error');
};
const retry = (box: HTMLElement) => fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
/** Queried again on every try: the shells and the stage are different elements with the same testid. */
const loaded = () =>
  waitFor(() => expect(screen.getByTestId('time-machine')).toHaveAttribute('data-engine', 'model'), {
    timeout: 15_000,
  });

describe('a time machine chunk that fails to load', { timeout: 30_000 }, () => {
  // First in the file: the chunks are module singletons, and a chunk that has loaded never fails again.
  it('is an ErrorBox in the box, view or logic, and each Retry loads again only what failed', async () => {
    chunks.view.fail = 1;
    chunks.impl.fail = 1;
    const { queryClient, read } = withSdk();
    renderLazy(queryClient);

    // The view chunk failed: LazyTimeMachine's box says so, and is not busy for ever.
    const view = await errorBox();
    expect(screen.getByTestId('time-machine')).not.toHaveAttribute('aria-busy');
    expect(chunks.view.imports).toBe(1);

    retry(view);
    // The view loads, TimeMachine replaces LazyTimeMachine's box, reads the engine, and its logic chunk fails.
    await waitFor(() => expect(view).not.toBeInTheDocument(), { timeout: 15_000 });
    const logic = await errorBox();
    expect(screen.getByTestId('time-machine')).not.toHaveAttribute('aria-busy');
    expect(chunks.view.imports).toBe(2);
    expect(chunks.impl.imports).toBe(1);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    retry(logic);
    await loaded();
    // This Retry loaded the logic again, and nothing else: not the view, not the engine.
    expect(chunks.impl.imports).toBe(2);
    expect(chunks.view.imports).toBe(2);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('an engine read that fails is the error; its Retry reads the engine again and loads no chunk again', async () => {
    const { queryClient, read } = withSdk(1);
    renderLazy(queryClient);
    const box = await errorBox();
    expect(read).toHaveBeenCalledTimes(1);
    // Run alone (-t), this test loads both chunks once; after the first test they are at hand. Either way, by now.
    await waitFor(() => expect(chunks.impl.imports).toBeGreaterThan(0), { timeout: 15_000 });
    const before = { view: chunks.view.imports, impl: chunks.impl.imports };

    retry(box);
    await loaded();
    expect(read).toHaveBeenCalledTimes(2);
    expect({ view: chunks.view.imports, impl: chunks.impl.imports }).toEqual(before);
  });
});
