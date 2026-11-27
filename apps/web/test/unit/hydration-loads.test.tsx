import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stepsChunk, useStepsChunk } from '../../src/app/create/edit-chunk';
import { flowsChunk } from '../../src/flows/load';
import { useFlows } from '../../src/flows/use-flows';
import { inOwnTask } from '../../src/lib/lazy-chunk';
import { makeWrapper } from '../helpers/render';

/** One macrotask later: every setTimeout(0) queued before this one has run. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 7C-F1: /create/ wants the flow chunk and its steps chunk as soon as it mounts. Started in the commit that hydrates the
 * page, their import() appended one script element per chunk inside that task (18 of them), the bulk of a 40-60 ms
 * hydration task and of the page's Total Blocking Time. Each load now starts in a task of its own.
 */
describe('the chunks /create/ loads at once', () => {
  it('the flow chunk: never in the commit that mounts useFlows, one task later', async () => {
    const load = vi.spyOn(flowsChunk, 'load').mockImplementation(() => new Promise(() => {}));
    renderHook(() => useFlows(), { wrapper: makeWrapper().wrapper });
    expect(load).not.toHaveBeenCalled();
    await nextTask();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the steps chunk: never in the commit that mounts useStepsChunk, one task later', async () => {
    const load = vi.spyOn(stepsChunk, 'load').mockImplementation(() => new Promise(() => {}));
    renderHook(() => useStepsChunk(), { wrapper: makeWrapper().wrapper });
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
  it('calls the loader in a later task and hands back its value or its error', async () => {
    const loader = vi.fn(() => Promise.resolve(7));
    const p = inOwnTask(loader)();
    expect(loader).not.toHaveBeenCalled();
    await expect(p).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
    const boom = new Error('offline');
    await expect(inOwnTask(() => Promise.reject(boom))()).rejects.toBe(boom);
  });
});
