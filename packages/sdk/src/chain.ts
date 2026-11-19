import { type Chain, defineChain } from 'viem';
import type { Deployment } from './deployments/index';

export function chainOf(d: Deployment): Chain {
  const xlayer = d.chainId === 196;
  return defineChain({
    id: d.chainId,
    name: xlayer ? 'X Layer' : d.name,
    nativeCurrency: xlayer
      ? { name: 'OKB', symbol: 'OKB', decimals: 18 }
      : { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: d.rpcUrls } },
    blockExplorers: d.explorerUrl ? { default: { name: 'Explorer', url: d.explorerUrl } } : undefined,
  });
}
