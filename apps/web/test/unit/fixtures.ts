import type { Deployment } from '@atropyle/sdk';

export const OKX = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];
export const DRPC = 'https://xlayer.drpc.org';

export function fixtureDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    name: 'xlayer',
    chainId: 196,
    rpcUrls: [...OKX],
    quorumRpcUrls: [[...OKX], [DRPC]],
    explorerUrl: 'https://www.oklink.com/xlayer',
    factory: '0x1111111111111111111111111111111111111111',
    factoryBlock: 1n,
    vaultImpl: '0x2222222222222222222222222222222222222222',
    vaultImplCodehash: `0x${'ab'.repeat(32)}`,
    cpu: '0x3333333333333333333333333333333333333333',
    policyId: 1n,
    treasury: '0x4444444444444444444444444444444444444444',
    feeTokens: ['0x5555555555555555555555555555555555555555'],
    circuits: null,
    tapeout: null,
    builderCode: null,
    webUrl: 'https://duongnq2798.github.io/atropyle/',
    logsBlockRange: 100,
    ...over,
  };
}
