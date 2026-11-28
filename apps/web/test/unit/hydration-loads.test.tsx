import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stepsChunk, useStepsChunk } from '../../src/app/create/edit-chunk';
import { flowsChunk } from '../../src/flows/load';
import { useFlows } from '../../src/flows/use-flows';
import { inOwnTask } from '../../src/lib/lazy-chunk';
import { makeWrapper } from '../helpers/render';

/** One macrotask later: every setTimeout(0) queued before this one has run. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Settles every microtask chain up to 100 hops deep and runs no task. A load deferred with Promise.resolve().then,
 * queueMicrotask or a few awaits has started by now: it would still append its script elements inside the task that
 * asked for it, so a test that checks "not called yet" only after this tells a later task from a later microtask.
 */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 7C-F1: /create/ wants the flow chunk and its steps chunk as soon as it mounts. Started in the commit that hydrates the
 * page, their import() appended one script element per chunk inside that task (18 of them), the bulk of a 40-60 ms
 * hydration task and of the page's Total Blocking Time. Each load now starts in a task of its own.
 */
describe('the chunks /create/ loads at once', () => {
  it('the flow chunk: neither in the commit that mounts useFlows nor in a microtask after it, one task later', async () => {
    const load = vi.spyOn(flowsChunk, 'load').mockImplementation(() => new Promise(() => {}));
    renderHook(() => useFlows(), { wrapper: makeWrapper().wrapper });
    await drainMicrotasks();
    expect(load).not.toHaveBeenCalled();
    await nextTask();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the steps chunk: neither in the commit that mounts useStepsChunk nor in a microtask after it, one task later', async () => {
    const load = vi.spyOn(stepsChunk, 'load').mockImplementation(() => new Promise(() => {}));
    renderHook(() => useStepsChunk(), { wrapper: makeWrapper().wrapper });
    await drainMicrotasks();
    expect(load).not.toHaveBeenCalled();
    await nextTask();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the query still gets the module through the deferred load', async () => {
    const module = {} as Awaited<ReturnType<typeof stepsChunk.load>>;
    vi.spyOn(stepsChunk, 'load').mockResolvedValue(module);
    const { result } = renderHook(() => useStepsChunk(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.data).toBe(module));
  });
});

describe('inOwnTask', () => {
  it('calls the loader in a later task, not a later microtask, and hands back its value or its error', async () => {
    const loader = vi.fn(() => Promise.resolve(7));
    const p = inOwnTask(loader)();
    expect(loader).not.toHaveBeenCalled();
    await drainMicrotasks();
    expect(loader).not.toHaveBeenCalled();
    await nextTask();
    expect(loader).toHaveBeenCalledTimes(1);
    await expect(p).resolves.toBe(7);
    const boom = new Error('offline');
    await expect(inOwnTask(() => Promise.reject(boom))()).rejects.toBe(boom);
  });
});
