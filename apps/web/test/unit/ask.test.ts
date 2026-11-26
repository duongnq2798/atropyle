// @vitest-environment node
import { encodeAbiParameters, type Hex } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASK_TIMEOUT_MS, askUrls, askXLayer, decodeStep, MAX_OPERATORS, operatorName } from '../../src/home/impl/ask';
import { ANSWER, ASK, ASK_RPC, ASK_TARGET } from '../../src/home/impl/ask-calls';

const OKX = ASK_RPC.quorumRpcUrls[0][0];
const DRPC = ASK_RPC.quorumRpcUrls[1][0];
const step = (next: Hex, out: Hex) => encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [next, out]);
const RIGHT = step(ANSWER.silent.next, ANSWER.silent.out);
const WRONG = step('0x00', '0x00');

type Reply = { result: unknown } | { error: { code: number; message: string } } | 'throw' | 'http500' | 'html' | 'hang';
interface Plan {
  block?: Reply;
  call?: Reply;
}

/** A fetch that answers JSON-RPC by URL and method, and records what it was asked and how many calls ran at once. */
function rpcFetch(plan: Record<string, Plan>) {
  const calls: { url: string; method: string; params: unknown[]; init: RequestInit }[] = [];
  let open = 0;
  let peak = 0;
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = JSON.parse(String(init.body)) as { jsonrpc: string; method: string; params: unknown[] };
    calls.push({ url, method: body.method, params: body.params, init });
    open++;
    peak = Math.max(peak, open);
    try {
      await Promise.resolve();
      const reply = (body.method === 'eth_blockNumber' ? plan[url]?.block : plan[url]?.call) ?? 'throw';
      if (reply === 'throw') throw new TypeError('Failed to fetch');
      if (reply === 'http500') return new Response('busy', { status: 500 });
      if (reply === 'html') return new Response('<html>', { status: 200 });
      if (reply === 'hang') {
        return await new Promise<Response>((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        );
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, ...reply }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } finally {
      open--;
    }
  }) as typeof fetch;
  return { fetcher, calls, peak: () => peak };
}

const answered = (call: Reply): Plan => ({ block: { result: '0x7b' }, call });

afterEach(() => vi.useRealTimers());

describe('decodeStep', () => {
  it('reads (bytes newState, bytes outputs) as viem encodes them', () => {
    expect(decodeStep(RIGHT)).toEqual({ next: '0x05', out: '0x04' });
    expect(decodeStep(step('0x', '0x'))).toEqual({ next: '0x', out: '0x' });
  });

  it('returns null for anything malformed, never throws', () => {
    for (const bad of [
      '',
      '0x',
      '0x1',
      'nothex',
      RIGHT.slice(0, 130),
      `${RIGHT.slice(0, 2)}${'f'.repeat(64)}${RIGHT.slice(66)}`,
    ]) {
      expect(decodeStep(bad), bad.slice(0, 20)).toBeNull();
    }
    // A length over 32 bytes: the processor never answers that for a 3-bit state.
    expect(decodeStep(step(`0x${'00'.repeat(33)}`, '0x04'))).toBeNull();
  });
});

describe('askUrls', () => {
  it('asks the first URL of every group rpcPlan keeps: dRPC on DeWEB only with the cross-check on (R18.19)', () => {
    expect(askUrls('vercel', false)).toEqual([OKX, DRPC]);
    expect(askUrls('deweb', false)).toEqual([OKX]);
    expect(askUrls('deweb', true)).toEqual([OKX, DRPC]);
    expect(askUrls('vercel', true).length).toBeLessThanOrEqual(MAX_OPERATORS);
  });

  it('names the operators', () => {
    expect([OKX, DRPC, 'https://xlayerrpc.okx.com', 'https://example.org'].map(operatorName)).toEqual([
      'OKX',
      'dRPC',
      'OKX',
      'example.org',
    ]);
  });
});

describe('askXLayer', () => {
  it('asks eth_blockNumber, then eth_call of step at that block, raw JSON-RPC with no credentials', async () => {
    const { fetcher, calls, peak } = rpcFetch({
      [OKX]: answered({ result: RIGHT }),
      [DRPC]: answered({ result: RIGHT }),
    });
    const outcome = await askXLayer('silent', { target: 'vercel', crossCheck: false, fetch: fetcher });
    expect(outcome).toMatchObject({
      verdict: 'match',
      block: 123n,
      by: 'OKX',
      release: true,
      want: { next: '0x05', out: '0x04' },
      got: null,
    });
    expect(outcome.operators.map((o) => [o.name, o.verdict])).toEqual([
      ['OKX', 'same'],
      ['dRPC', 'same'],
    ]);
    for (const url of [OKX, DRPC]) {
      const mine = calls.filter((c) => c.url === url);
      expect(mine.map((c) => c.method)).toEqual(['eth_blockNumber', 'eth_call']);
      expect(mine[1].params).toEqual([{ to: ASK_TARGET.cpu, data: ASK.silent }, '0x7b']);
    }
    for (const c of calls) {
      expect(c.init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store' });
    }
    expect(peak()).toBeLessThanOrEqual(MAX_OPERATORS);
  });

  it('says mismatch when an operator answers differently, with the raw bytes', async () => {
    const { fetcher } = rpcFetch({ [OKX]: answered({ result: RIGHT }), [DRPC]: answered({ result: WRONG }) });
    const outcome = await askXLayer('silent', { target: 'vercel', crossCheck: false, fetch: fetcher });
    // The sentence names the operator that differs, and its bytes.
    expect(outcome).toMatchObject({
      verdict: 'mismatch',
      block: 123n,
      by: 'dRPC',
      got: { next: '0x00', out: '0x00' },
      want: { next: '0x05', out: '0x04' },
    });
    expect(outcome.operators.map((o) => o.verdict)).toEqual(['same', 'different']);
  });

  it('says mismatch when the processor refuses: a revert is an answer', async () => {
    const revert = { error: { code: 3, message: 'execution reverted' } };
    const { fetcher } = rpcFetch({ [OKX]: answered(revert) });
    const outcome = await askXLayer('alive', { target: 'deweb', crossCheck: false, fetch: fetcher });
    expect(outcome).toMatchObject({ verdict: 'mismatch', got: null, block: 123n, by: 'OKX' });
    expect(outcome.operators[0].verdict).toBe('reverted');
  });

  it('never calls a slow or blocked operator a mismatch: it is not reachable (R18.19)', async () => {
    for (const bad of [
      'throw',
      'http500',
      'html',
      { error: { code: -32005, message: 'limit exceeded' } },
      { result: '0x1234' },
    ] as const) {
      const { fetcher } = rpcFetch({ [OKX]: answered(bad) });
      const outcome = await askXLayer('alive', { target: 'deweb', crossCheck: false, fetch: fetcher });
      expect(outcome.verdict, JSON.stringify(bad)).toBe('unreachable');
      expect(outcome.operators[0].verdict).toBe('unreachable');
    }
  });

  it('counts a partial answer as a match, and marks the operator it could not reach', async () => {
    const { fetcher } = rpcFetch({ [OKX]: answered({ result: step(ANSWER.liar.next, ANSWER.liar.out) }) });
    const outcome = await askXLayer('liar', { target: 'vercel', crossCheck: false, fetch: fetcher });
    expect(outcome.verdict).toBe('match');
    expect(outcome.operators.map((o) => o.verdict)).toEqual(['same', 'unreachable']);
  });

  it(`gives up on an operator after ${ASK_TIMEOUT_MS} ms`, async () => {
    vi.useFakeTimers();
    const { fetcher } = rpcFetch({ [OKX]: { block: 'hang' } });
    const pending = askXLayer('alive', { target: 'deweb', crossCheck: false, fetch: fetcher });
    await vi.advanceTimersByTimeAsync(ASK_TIMEOUT_MS);
    expect((await pending).verdict).toBe('unreachable');
  });
});
