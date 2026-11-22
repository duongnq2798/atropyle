import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Address } from 'viem';
import { rpc } from '../../../../scripts/lib/anvil.ts';

export interface E2EState {
  rpcUrl: string;
  siteUrl: string;
  snapshot: string;
  deployment: Record<string, unknown>;
  seeded: { simple: Address; guarded: Address; grace: Address };
}

const FILE = fileURLToPath(new URL('./.state.json', import.meta.url));

export function writeState(s: E2EState): void {
  writeFileSync(FILE, `${JSON.stringify(s, null, 2)}\n`);
}

export function readState(): E2EState {
  return JSON.parse(readFileSync(FILE, 'utf8')) as E2EState;
}

export const rpcCall: (url: string, method: string, params?: unknown[]) => Promise<unknown> = rpc;

/** evm_revert consumes the snapshot, so a new one is taken for the next test. */
export async function resetChain(s: E2EState): Promise<E2EState> {
  const ok = await rpcCall(s.rpcUrl, 'evm_revert', [s.snapshot]);
  if (ok !== true) throw new Error(`evm_revert(${s.snapshot}) failed`);
  const next = { ...s, snapshot: (await rpcCall(s.rpcUrl, 'evm_snapshot')) as string };
  writeState(next);
  return next;
}

export async function warp(s: E2EState, seconds: number): Promise<void> {
  await rpcCall(s.rpcUrl, 'evm_increaseTime', [seconds]);
  await rpcCall(s.rpcUrl, 'evm_mine');
}
