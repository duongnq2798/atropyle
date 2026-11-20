import type { Deployment } from '@atropyle/sdk';
import type { Target } from '../env';

/** Nodes the TapeKit gateway counts as the site's own chain (sw.js `siteNodes` for X Layer, read 18/11/2026). */
const ONCHAIN_RPCS: readonly string[] = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];

export interface RpcPlan {
  read: string[];
  verify: string[][];
  /** Verify reads from more than one operator. */
  crossCheck: boolean;
  /** URLs the DeWEB gateway reports as off-chain requests (always empty on Pages). */
  offchain: string[];
}

function isOnchainRpc(url: string): boolean {
  try {
    return ONCHAIN_RPCS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function rpcPlan(d: Deployment, target: Target, crossCheck: boolean): RpcPlan {
  if (target === 'pages') {
    const verify = d.quorumRpcUrls.map((g) => [...g]);
    return { read: [...d.rpcUrls], verify, crossCheck: verify.length > 1, offchain: [] };
  }
  const own = d.quorumRpcUrls.map((g) => g.filter(isOnchainRpc)).filter((g) => g.length > 0);
  const other = d.quorumRpcUrls.map((g) => g.filter((u) => !isOnchainRpc(u))).filter((g) => g.length > 0);
  const onchainRead = d.rpcUrls.filter(isOnchainRpc);
  const read = onchainRead.length > 0 ? onchainRead : [...d.rpcUrls];
  const verify = own.length === 0 ? d.quorumRpcUrls.map((g) => [...g]) : crossCheck ? [...own, ...other] : own;
  const offchain = [...new Set([...read, ...verify.flat()].filter((u) => !isOnchainRpc(u)))];
  return { read, verify, crossCheck: verify.length > 1, offchain };
}
