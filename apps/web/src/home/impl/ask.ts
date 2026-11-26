import { rpcPlan } from '@/chain/impl/rpc';
import type { Target } from '@/config/env';
import type { HeroCase } from '../hero-cases';
import { ANSWER, ASK, ASK_RPC, ASK_TARGET } from './ask-calls';

/** R18.19: at most three calls at once. Each operator makes its two calls one after the other. */
export const MAX_OPERATORS = 3;
/** A call with no answer by then counts as not reachable. */
export const ASK_TIMEOUT_MS = 8_000;

export type OperatorVerdict = 'same' | 'different' | 'reverted' | 'unreachable';

export interface OperatorAnswer {
  /** OKX, dRPC, or the host name. */
  name: string;
  origin: string;
  verdict: OperatorVerdict;
  /** The block it was asked at; null when it never gave one. */
  block: bigint | null;
  /** Its answer as `newState/outputs`, when it gave one. Read from the chain: shown only through UntrustedText. */
  answer: string | null;
}

export interface AskOutcome {
  /** match: every operator that answered agrees with this page; mismatch: one differs or refused; else unreachable. */
  verdict: 'match' | 'mismatch' | 'unreachable';
  /** The block of the operator the sentence names: the first that differs, else the first that agrees. */
  block: bigint | null;
  /** This page's answer: whether the gate opens, and `newState/outputs`. */
  release: boolean;
  want: string;
  /** The differing answer as `newState/outputs`; null on a match and for a refusal. */
  got: string | null;
  operators: OperatorAnswer[];
}

export interface AskOptions {
  target: Target;
  crossCheck: boolean;
  /** For tests; the page's own fetch otherwise. */
  fetch?: typeof fetch;
}

const HOSTS: readonly (readonly [RegExp, string])[] = [
  [/(^|\.)(xlayer\.tech|okx\.com)$/, 'OKX'],
  [/(^|\.)drpc\.org$/, 'dRPC'],
];

export function operatorName(url: string): string {
  const host = new URL(url).hostname;
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? host;
}

/**
 * The first URL of every group that rpcPlan's verify keeps: the OKX node, plus dRPC on Vercel, or on DeWEB when the
 * reader turned the cross-check on (DeWEB counts it as off-chain). No failover inside a group (ruling R7).
 */
export function askUrls(target: Target, crossCheck: boolean): string[] {
  return rpcPlan(ASK_RPC, target, crossCheck)
    .verify.flatMap((group) => group.slice(0, 1))
    .slice(0, MAX_OPERATORS);
}

class Unreachable extends Error {}
class Reverted extends Error {}

const QUANTITY = /^0x[0-9a-f]{1,16}$/i;
const BYTES = /^0x(?:[0-9a-f]{2})*$/i;

/** A refusal by the contract (geth's code 3, or a node that only says "execution reverted"), not a transport error. */
function isRevert(error: { code?: unknown; message?: unknown }): boolean {
  return error.code === 3 || (typeof error.message === 'string' && /revert/i.test(error.message));
}

async function call(fetcher: typeof fetch, url: string, method: string, params: unknown[]): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ASK_TIMEOUT_MS);
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: abort.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    }).catch(() => {
      throw new Unreachable();
    });
    if (!res.ok) throw new Unreachable();
    const body: unknown = await res.json().catch(() => {
      throw new Unreachable();
    });
    if (typeof body !== 'object' || body === null) throw new Unreachable();
    const { result, error } = body as { result?: unknown; error?: unknown };
    if (error !== undefined && error !== null) {
      throw typeof error === 'object' && isRevert(error) ? new Reverted() : new Unreachable();
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * step() returns (bytes newState, bytes outputs): two offsets, then each length and its bytes. Null for anything
 * malformed, or longer than 32 bytes (the policy has 3 state bits and 3 outputs).
 */
export function decodeStep(hex: string): { next: string; out: string } | null {
  if (!BYTES.test(hex)) return null;
  const b = hex.slice(2).toLowerCase();
  const size = b.length / 2;
  const word = (at: number): number | null => {
    if (at < 0 || at + 32 > size) return null;
    const w = BigInt(`0x${b.slice(at * 2, (at + 32) * 2)}`);
    return w <= BigInt(size) ? Number(w) : null;
  };
  const bytesAt = (head: number): string | null => {
    const offset = word(head);
    const length = offset === null ? null : word(offset);
    if (offset === null || length === null || length > 32 || offset + 32 + length > size) return null;
    return `0x${b.slice((offset + 32) * 2, (offset + 32 + length) * 2)}`;
  };
  const next = bytesAt(0);
  const out = bytesAt(32);
  return next === null || out === null ? null : { next, out };
}

async function askOne(fetcher: typeof fetch, url: string, c: HeroCase): Promise<OperatorAnswer> {
  const who = { name: operatorName(url), origin: new URL(url).origin };
  let block: bigint | null = null;
  try {
    const head = await call(fetcher, url, 'eth_blockNumber', []);
    if (typeof head !== 'string' || !QUANTITY.test(head)) throw new Unreachable();
    block = BigInt(head);
    const data = await call(fetcher, url, 'eth_call', [
      { to: ASK_TARGET.cpu, data: ASK[c] },
      `0x${block.toString(16)}`,
    ]);
    const step = typeof data === 'string' ? decodeStep(data) : null;
    if (step === null) throw new Unreachable();
    const want = ANSWER[c];
    const same = step.next === want.next && step.out === want.out;
    return { ...who, verdict: same ? 'same' : 'different', block, answer: `${step.next}/${step.out}` };
  } catch (e) {
    return { ...who, verdict: e instanceof Reverted ? 'reverted' : 'unreachable', block, answer: null };
  }
}

export function outcomeOf(c: HeroCase, operators: OperatorAnswer[]): AskOutcome {
  const want = ANSWER[c];
  const odd = operators.find((op) => op.verdict === 'different' || op.verdict === 'reverted');
  const named = odd ?? operators.find((op) => op.verdict === 'same');
  return {
    verdict: odd ? 'mismatch' : named ? 'match' : 'unreachable',
    block: named?.block ?? null,
    release: want.release,
    want: `${want.next}/${want.out}`,
    got: odd?.answer ?? null,
    operators,
  };
}

/**
 * Asks the policy circuit on the X Layer processor the hero's question `c`, on demand (R18.19): read-only calls,
 * nothing signed, no SDK and no viem. Each operator is asked at its own latest block.
 */
export async function askXLayer(c: HeroCase, o: AskOptions): Promise<AskOutcome> {
  const fetcher = o.fetch ?? fetch.bind(globalThis);
  const operators = await Promise.all(askUrls(o.target, o.crossCheck).map((url) => askOne(fetcher, url, c)));
  return outcomeOf(c, operators);
}
