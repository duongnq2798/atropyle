import { describe, expect, it } from 'vitest';
import { deploymentToJson, getDeployment, parseDeployment, resolveDeployment } from '../../src/index';

const FIXTURE = {
  name: 'xlayer',
  chainId: 196,
  rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
  quorumRpcUrls: [['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'], ['https://xlayer.drpc.org']],
  explorerUrl: 'https://www.oklink.com/xlayer',
  factory: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  factoryBlock: '123456',
  vaultImpl: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
  vaultImplCodehash: `0x${'ab'.repeat(32)}`,
  cpu: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  policyId: '3',
  treasury: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  feeTokens: [
    '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
    '0xB6CEceAB302E2E4948951eE7843FC24E92933061',
    '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
  ],
  circuits: {
    kofn5: '1',
    ge4: '2',
    netlistKeccak: { kofn5: `0x${'01'.repeat(32)}`, ge4: `0x${'02'.repeat(32)}`, policy: `0x${'03'.repeat(32)}` },
  },
  tapeout: {
    factory: '0x1f09DAeFA827f02CBb40967cc91b259763760761',
    beacon: '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C',
    beaconSlot: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
    name: 'Atropyle',
    symbol: 'ATRO',
  },
  builderCode: 'atropyle',
  webUrl: 'https://atropyle.okx',
  logsBlockRange: 5000,
};

describe('parseDeployment', () => {
  it('parses a full description into typed values', () => {
    const d = parseDeployment(FIXTURE);
    expect(d.chainId).toBe(196);
    expect(d.factoryBlock).toBe(123456n);
    expect(d.policyId).toBe(3n);
    expect(d.vaultImpl).toBe('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512');
    expect(d.circuits?.ge4).toBe(2n);
    expect(d.quorumRpcUrls).toHaveLength(2);
    expect(deploymentToJson(d)).toEqual({ ...FIXTURE, vaultImpl: d.vaultImpl });
  });

  it('accepts a devnet description without circuits or tapeout', () => {
    const d = parseDeployment({
      ...FIXTURE,
      name: 'local',
      chainId: 31337,
      circuits: null,
      tapeout: null,
      builderCode: null,
    });
    expect(d.circuits).toBeNull();
    expect(d.tapeout).toBeNull();
  });

  it.each([
    ['factory', { factory: '0x123' }],
    ['factoryBlock', { factoryBlock: 'soon' }],
    ['quorumRpcUrls[1]', { quorumRpcUrls: [['https://a'], []] }],
    ['vaultImplCodehash', { vaultImplCodehash: '0x1234' }],
    [
      'circuits.netlistKeccak.policy',
      {
        circuits: {
          ...FIXTURE.circuits,
          netlistKeccak: { kofn5: FIXTURE.circuits.netlistKeccak.kofn5, ge4: FIXTURE.circuits.netlistKeccak.ge4 },
        },
      },
    ],
    ['feeTokens', { feeTokens: [] }],
    ['logsBlockRange', { logsBlockRange: 0 }],
  ])('rejects a bad %s with its path', (path, patch) => {
    expect(() => parseDeployment({ ...FIXTURE, ...patch })).toThrow(
      expect.objectContaining({
        code: 'DEPLOYMENT_INVALID',
        details: expect.objectContaining({ path: expect.stringContaining(path) }),
      }),
    );
  });
});

describe('resolveDeployment', () => {
  it('throws DEPLOYMENT_MISSING for a chain that is not deployed yet', () => {
    expect(() => resolveDeployment('xlayer', { xlayer: null, local: null })).toThrow(
      expect.objectContaining({ code: 'DEPLOYMENT_MISSING' }),
    );
  });

  it('accepts a registry entry or an explicit object', () => {
    expect(resolveDeployment('xlayer', { xlayer: FIXTURE, local: null }).chainId).toBe(196);
    const d = parseDeployment(FIXTURE);
    expect(resolveDeployment(d, { xlayer: null, local: null })).toEqual(d);
  });

  it('validates an explicit object too: checksums its addresses, rejects logsBlockRange 0', () => {
    const d = parseDeployment(FIXTURE);
    const lower = { ...d, factory: d.factory.toLowerCase() as typeof d.factory };
    expect(resolveDeployment(lower, { xlayer: null, local: null }).factory).toBe(d.factory);
    expect(getDeployment(lower).factory).toBe(d.factory);
    for (const call of [
      () => getDeployment({ ...d, logsBlockRange: 0 }),
      () => resolveDeployment({ ...d, logsBlockRange: 0 }, { xlayer: null, local: null }),
    ]) {
      expect(call).toThrow(expect.objectContaining({ code: 'DEPLOYMENT_INVALID' }));
    }
  });
});
