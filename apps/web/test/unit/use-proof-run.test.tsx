import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROOF_BLOCKS } from '../../src/proof/paint';
import { useProofRun } from '../../src/proof/use-proof-run';
import type { PolicyVerification } from '../../src/verify/types';
import { makeWrapper } from '../helpers/render';
import { okResult } from './proof-result';

const impl = vi.hoisted(() => ({ runProof: vi.fn(), runVaultVerify: vi.fn() }));
vi.mock('../../src/verify/load', () => ({ loadVerifyImpl: async () => impl }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: unknown) => ({ deployment, atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

interface Opts {
  blocks?: number;
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
}
const optsOf = (call: number) => impl.runProof.mock.calls[call][1] as Opts;

/** A run the test ends by hand. */
function deferred() {
  let resolve: (r: PolicyVerification) => void = () => undefined;
  const promise = new Promise<PolicyVerification>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

const hook = () => renderHook(() => useProofRun(), { wrapper: makeWrapper().wrapper });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useProofRun', () => {
  it('starts the session proof, the one /verify/ joins: no blocks, no signal, loading until the first count', async () => {
    const d = deferred();
    impl.runProof.mockReturnValue(d.promise);
    const h = hook();
    expect(h.result.current.status).toBe('idle');
    act(() => h.result.current.start());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(1));
    expect(optsOf(0).blocks).toBeUndefined();
    expect(optsOf(0).signal).toBeUndefined();
    expect(h.result.current.status).toBe('loading');
    act(() => optsOf(0).onProgress?.(4096, PROOF_BLOCKS));
    await waitFor(() => expect(h.result.current.status).toBe('running'));
    expect(h.result.current.doneBlocks).toBe(4096);
    await act(async () => d.resolve(okResult()));
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(h.result.current.doneBlocks).toBe(PROOF_BLOCKS);
    expect(h.result.current.runs).toBe(0);
  });

  it('runs again fresh, over every block with its own signal; a second press or leaving the page stops the first', async () => {
    impl.runProof.mockImplementation(() => new Promise(() => undefined));
    const h = hook();
    act(() => h.result.current.again());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(1));
    expect(optsOf(0).blocks).toBe(PROOF_BLOCKS);
    expect(h.result.current).toMatchObject({ status: 'loading', doneBlocks: 0, runs: 1 });
    act(() => h.result.current.again());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(2));
    expect(optsOf(0).signal?.aborted).toBe(true);
    expect(optsOf(1).signal?.aborted).toBe(false);
    expect(h.result.current.runs).toBe(2);
    h.unmount();
    expect(optsOf(1).signal?.aborted).toBe(true);
  });

  it('shows only the latest fresh run: a stopped run that still answers changes nothing', async () => {
    const first = deferred();
    const second = deferred();
    impl.runProof.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const h = hook();
    act(() => h.result.current.again());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(1));
    act(() => h.result.current.again());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(2));
    act(() => optsOf(0).onProgress?.(9999, PROOF_BLOCKS));
    await act(async () => first.resolve(okResult({ ok: false })));
    expect(h.result.current.status).toBe('loading');
    act(() => optsOf(1).onProgress?.(4096, PROOF_BLOCKS));
    expect(h.result.current).toMatchObject({ status: 'running', doneBlocks: 4096 });
    await act(async () => second.resolve(okResult()));
    expect(h.result.current.status).toBe('done');
    expect(h.result.current.result?.ok).toBe(true);
  });

  it('retries what failed: the session proof after a session error, a fresh run after a fresh error', async () => {
    impl.runProof.mockRejectedValueOnce(new Error('rpc down')).mockImplementation(() => new Promise(() => undefined));
    const h = hook();
    act(() => h.result.current.start());
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    act(() => h.result.current.retry());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(2));
    expect(optsOf(1).blocks).toBeUndefined();
    impl.runProof.mockRejectedValueOnce(new Error('rpc down'));
    act(() => h.result.current.again());
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    act(() => h.result.current.retry());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(4));
    expect(optsOf(3).blocks).toBe(PROOF_BLOCKS);
  });

  it('warms the SDK and the proof code without running anything', async () => {
    const h = hook();
    act(() => h.result.current.warm());
    await act(async () => undefined);
    expect(impl.runProof).not.toHaveBeenCalled();
    expect(h.result.current.status).toBe('idle');
  });
});
