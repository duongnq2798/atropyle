import { type Address, BaseError, type Hex, type PublicClient } from 'viem';
import { decodeError, decodeRevertData, isTransportError } from '../errors';
import type { Simulation } from './types';

interface Tx {
  to: Address;
  data: Hex;
  value: bigint;
}

/** The part of a viem simulateCalls result that is read here. */
type CallResults = readonly (
  | { status: 'success'; gasUsed: bigint }
  | { status: 'failure'; data?: Hex; error: unknown }
)[];

/** JSON-RPC codes for "this endpoint does not offer the method": method not found (EIP-1474) and method not supported. */
const METHOD_UNSUPPORTED = new Set([-32601, -32004]);

/**
 * True when the endpoint says it has no such method, whatever the HTTP status around it: OKX answers eth_simulateV1
 * with HTTP 403 and JSON-RPC -32601 "rpc method is not whitelisted". Checked on the JSON-RPC code, before any
 * classification of the status, so treating a 401 or 403 as a transport failure elsewhere cannot make every
 * multi-step prepare on that endpoint throw.
 */
function isMethodUnsupported(e: unknown): boolean {
  return (
    e instanceof BaseError &&
    e.walk((x) => METHOD_UNSUPPORTED.has((x as { code?: unknown } | null)?.code as number)) !== null
  );
}

async function estimate(c: PublicClient, from: Address, t: Tx): Promise<Simulation> {
  try {
    return { ok: true, gas: await c.estimateGas({ account: from, to: t.to, data: t.data, value: t.value }) };
  } catch (e) {
    const err = decodeError(e);
    // A failing RPC says nothing about the transaction: it is never turned into a failed simulation.
    if (isTransportError(err)) throw err;
    return { ok: false, error: err.toJSON() };
  }
}

/**
 * Each step sees the state left by the previous ones (eth_simulateV1). Without eth_simulateV1 (OKX RPC answers
 * "rpc method is not whitelisted", measured 18/11), every step is estimated on its own: a later step that fails
 * alone may only need an earlier one, so it is reported as skipped rather than failed. Only "the endpoint has no
 * such method" falls back; any other failure (rate limit, endpoint down, refused key) is thrown as what it is.
 */
export async function simulateTxs(c: PublicClient, from: Address, txs: readonly Tx[]): Promise<Simulation[]> {
  if (txs.length === 0) return [];
  if (txs.length === 1) return [await estimate(c, from, txs[0])];
  let results: CallResults;
  try {
    const r = await c.simulateCalls({
      account: from,
      calls: txs.map((t) => ({ to: t.to, data: t.data, value: t.value })),
    });
    results = r.results;
  } catch (e) {
    if (!isMethodUnsupported(e)) throw decodeError(e);
    const sims = await Promise.all(txs.map((t) => estimate(c, from, t)));
    return sims.map(
      (s, i): Simulation => (i > 0 && s.ok === false ? { ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' } : s),
    );
  }
  return results.map((x): Simulation => {
    if (x.status === 'success') return { ok: true, gas: x.gasUsed };
    const err = (x.data ? decodeRevertData(x.data) : null) ?? decodeError(x.error);
    return { ok: false, error: err.toJSON() };
  });
}
