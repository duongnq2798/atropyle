import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { encodeAbiParameters, type Hex } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskXLayer, askChunk } from '../../src/home/ask-x-layer';
import { ANSWER, ASK_RPC } from '../../src/home/impl/ask-calls';
import { KEYS, memoryKV } from '../../src/lib/store';
import { renderWithProviders } from '../helpers/render';

// The chunk counts its imports and then loads for real, as in lazy-overlays.test.tsx. A static import of it in
// ask-x-layer.tsx would count before the first test runs; a preload at mount or at idle would count in it (R20).
const chunk = vi.hoisted(() => ({ imports: 0 }));
vi.mock('../../src/home/impl/ask-view', async (importOriginal) => {
  chunk.imports += 1;
  return importOriginal();
});

const OKX = ASK_RPC.quorumRpcUrls[0][0];
const DRPC = ASK_RPC.quorumRpcUrls[1][0];
const spoken = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const named = (text: string) => (name: string) => spoken(name) === text;
const step = (next: Hex, out: Hex) => encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [next, out]);

/** JSON-RPC by URL: block 123 everywhere, and this eth_call result; a URL left out is unreachable. */
function stubRpc(results: Record<string, Hex>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const { method } = JSON.parse(String(init?.body)) as { method: string };
    if (!(url in results)) throw new TypeError('Failed to fetch');
    const result = method === 'eth_blockNumber' ? '0x7b' : results[url];
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ask(): Promise<HTMLElement> {
  const box = screen.getByTestId('ask-x-layer');
  fireEvent.click(screen.getByRole('button', { name: named('Ask X Layer') }));
  await waitFor(() => expect(box.getAttribute('data-phase')).toBe('done'), { timeout: 5_000 });
  return box;
}

// First in the file: once a test has loaded the chunk, it stays loaded for the tests after it.
describe('the ask chunk loads on intent only (ruling R20)', () => {
  it('loads nothing and asks nothing at mount or once the page is idle; pointerenter starts the import', async () => {
    const fetch = stubRpc({});
    const preload = vi.spyOn(askChunk, 'preload');
    const load = vi.spyOn(askChunk, 'load');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // whenIdle on the fake clock: requestIdleCallback becomes a timer, like its 1.5 s fallback without it.
    vi.stubGlobal('requestIdleCallback', (task: () => void) => setTimeout(task, 0));
    vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
    renderWithProviders(<AskXLayer choice="alive" />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    vi.useRealTimers();
    expect([chunk.imports, preload.mock.calls.length, load.mock.calls.length]).toEqual([0, 0, 0]);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.pointerEnter(screen.getByRole('button', { name: named('Ask X Layer') }));
    expect(preload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(chunk.imports).toBe(1));
    // The code is there, and X Layer is asked nothing until a press.
    expect(load).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts the import on focus of the button too', () => {
    const preload = vi.spyOn(askChunk, 'preload');
    renderWithProviders(<AskXLayer choice="alive" />);
    expect(preload).not.toHaveBeenCalled();
    act(() => screen.getByRole('button', { name: named('Ask X Layer') }).focus());
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('loads it on a press with no hover or focus before it, as a tap does', async () => {
    stubRpc({ [OKX]: step(ANSWER.alive.next, ANSWER.alive.out) });
    const preload = vi.spyOn(askChunk, 'preload');
    const load = vi.spyOn(askChunk, 'load');
    renderWithProviders(<AskXLayer choice="alive" />);
    const box = await ask();
    expect(box.getAttribute('data-verdict')).toBe('match');
    expect(preload).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('Ask X Layer', () => {
  it('waits for a press, then asks only the OKX node on DeWEB and says X Layer answered as this page did', async () => {
    const fetch = stubRpc({ [OKX]: step(ANSWER.silent.next, ANSWER.silent.out) });
    renderWithProviders(<AskXLayer choice="silent" />);
    expect(screen.getByTestId('ask-x-layer').className).not.toContain('invisible');
    expect(spoken(screen.getByRole('status').textContent)).toBe(
      'Your browser asks the processor on X Layer the same question. Nothing to sign.',
    );
    expect(fetch).not.toHaveBeenCalled();
    const box = await ask();
    expect(box.getAttribute('data-verdict')).toBe('match');
    expect(spoken(screen.getByRole('status').textContent)).toBe(
      'X Layer answered at block 123: the gate opens. Same as this page. OKXsame answer',
    );
    expect(new Set(fetch.mock.calls.map(([url]) => String(url)))).toEqual(new Set([OKX]));
    // ✓ is an icon, never a character (glyphs.test.ts).
    expect(screen.getByRole('status').querySelectorAll('svg')).toHaveLength(1);
  });

  it('with the cross-check on, a differing operator turns the line red and shows its raw bytes as chain text', async () => {
    stubRpc({ [OKX]: step(ANSWER.alive.next, ANSWER.alive.out), [DRPC]: step('0x05', '0x04') });
    const kv = memoryKV();
    kv.set(KEYS.crossCheck, '1');
    renderWithProviders(<AskXLayer choice="alive" />, { kv });
    // ChainProvider reads the cross-check in an effect.
    await waitFor(() => expect(screen.getByTestId('ask-x-layer')).toBeTruthy());
    const box = await ask();
    expect(box.getAttribute('data-verdict')).toBe('mismatch');
    const status = screen.getByRole('status');
    expect(status.querySelector('.text-danger')).not.toBeNull();
    expect(status.querySelector('bdi[data-untrusted]')?.textContent).toBe('0x05/0x04');
    expect(spoken(status.textContent)).toContain('X Layer answered differently at block 123:');
    expect(spoken(status.textContent)).toContain('this page says 0x00/0x00.');
  });

  it('says X Layer is not reachable when no operator answers', async () => {
    stubRpc({});
    renderWithProviders(<AskXLayer choice="liar" />);
    const box = await ask();
    expect(box.getAttribute('data-verdict')).toBe('unreachable');
    expect(spoken(screen.getByRole('status').textContent)).toBe('X Layer is not reachable from this device.');
  });
});
