import type { Address, PublicClient } from 'viem';
import type { Deployment } from '../deployments/index';
import { readTokenInfo } from './tokens';
import type { TokenInfo } from './types';

export interface SdkEvent {
  type: 'read' | 'simulate' | 'send' | 'verify';
  what: string;
  ms?: number;
  blockNumber?: bigint;
}

export interface ReadContext {
  deployment: Deployment;
  client: PublicClient;
  /** Token metadata, cached per client (it does not change). */
  token(address: Address, blockNumber?: bigint): Promise<TokenInfo>;
  log(e: SdkEvent): void;
}

export function createReadContext(
  deployment: Deployment,
  client: PublicClient,
  logger?: (e: SdkEvent) => void,
): ReadContext {
  const tokens = new Map<string, Promise<TokenInfo>>();
  return {
    deployment,
    client,
    token(address, blockNumber) {
      const key = address.toLowerCase();
      let p = tokens.get(key);
      if (!p) {
        p = readTokenInfo(client, address, blockNumber);
        // A failed read (a flaky RPC) must not stay cached: the next call asks again.
        p.catch(() => tokens.delete(key));
        tokens.set(key, p);
      }
      return p;
    },
    log(e) {
      logger?.(e);
    },
  };
}
