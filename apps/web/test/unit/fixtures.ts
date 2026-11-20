import type { Deployment, Stats } from '@atropyle/sdk';

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

export function fixtureStats(): Stats {
  return {
    fromBlock: 10n,
    toBlock: 2_000n,
    vaults: { total: 3, drill: 2, paid: 1 },
    owners: 2,
    checkIns: 5,
    alarms: 1,
    releases: 0,
    distributions: 0,
    cursor: {
      toBlock: 2_000n,
      vaults: [
        {
          vault: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
          owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          drill: true,
        },
        {
          vault: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
          owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          drill: true,
        },
        {
          vault: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
          owner: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
          drill: false,
        },
      ],
      aliveEvents: 8,
      alarms: 1,
      releases: 0,
      distributions: 0,
    },
  };
}
