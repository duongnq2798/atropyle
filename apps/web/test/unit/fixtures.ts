import { type Deployment, type Stats, type Timeline, untrusted, type VaultSnapshot } from '@atropyle/sdk';

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

export const PEOPLE = {
  owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  heirA: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  heirB: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  g1: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  g2: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  stranger: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  vault: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  nft: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
} as const;

/** A guarded Drill like the devnet's "guarded" seed: 70/30 heirs, heirB is also a guardian, ERC-20 half covered. */
export function fixtureSnapshot(): VaultSnapshot {
  const usd = { address: PEOPLE.token, symbol: untrusted('USDT0', 16), name: untrusted('Tether USD', 32), decimals: 6 };
  const nft = { address: PEOPLE.nft, symbol: untrusted('MNFT', 16), name: untrusted('Mock NFT', 32), decimals: null };
  const erc20 = { kind: 'erc20' as const, token: PEOPLE.token, id: 0n, heir: 0 };
  const erc721 = { kind: 'erc721' as const, token: PEOPLE.nft, id: 2n, heir: 1 };
  return {
    config: {
      owner: PEOPLE.owner,
      drill: true,
      heirs: [
        { account: PEOPLE.heirA, bps: 7000 },
        { account: PEOPLE.heirB, bps: 3000 },
      ],
      guardians: [PEOPLE.g1, PEOPLE.g2, PEOPLE.heirB],
      k: 2,
      recoveryEnabled: true,
      timing: { period: 60, threshold: 2, window: 120 },
      assets: [erc20, erc721],
    },
    status: {
      vault: PEOPLE.vault,
      chainId: 31337,
      blockNumber: 100n,
      blockTimestamp: 1_000n,
      state: 'active',
      stateCode: 0,
      pending: 'active',
      pendingCode: 0,
      idle: 0,
      lastAlive: 990n,
      lateAt: 1_050n,
      alarmAt: null,
      windowEndsAt: null,
      releasedAt: null,
      expiresAt: 605_800n,
      expired: false,
      inhVotes: 0,
      inhVoters: [],
      recoveryTarget: null,
      recVotes: [],
      assets: [
        { index: 0, asset: erc20, token: usd, coverage: 500_000n, held: 1_000_000n },
        { index: 1, asset: erc721, token: nft, coverage: 0n, held: 0n },
      ],
    },
    binding: {
      factory: '0x1111111111111111111111111111111111111111',
      cpu: '0x3333333333333333333333333333333333333333',
      policyId: 1n,
    },
  };
}

export function fixtureTimeline(): Timeline {
  return {
    now: 1_000n,
    engine: 'model',
    milestones: { lateAt: 1_050n, maxedAt: 1_110n, windowEndsAt: null, expiresAt: 605_800n },
    events: [{ at: 1_110n, kind: 'alarm', from: 'active', state: 'grace', note: 'Anyone can raise the alarm.' }],
    earliestRelease: 1_230n,
    nextCheckAt: 1_110n,
  };
}
