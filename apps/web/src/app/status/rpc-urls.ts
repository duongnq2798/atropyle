import type { RpcPlan } from '@/chain/types';

/**
 * Every URL the page reads or verifies through, once each, in plan order. A module of its own, with no viem, so the
 * page draws one placeholder row per node before the diagnostics chunk loads.
 */
export function rpcUrlsOf(rpc: RpcPlan): string[] {
  return [...new Set([...rpc.read, ...rpc.verify.flat()])];
}
