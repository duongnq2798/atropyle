import { bytesToHex, getAddress, keccak256, type PublicClient, RpcRequestError } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { type Deployment, getDeployment } from '../../src/deployments/index';
import type { ReadContext } from '../../src/read/context';
import { readCpuCheck } from '../../src/verify/cpu';
import type { PolicyVerification } from '../../src/verify/index';
import { eip1167 } from '../../src/verify/vault';

vi.mock('../../src/read/snapshot', () => ({
  readSnapshot: async () => ({ binding: { factory: FACTORY, cpu: CPU, policyId: 7n } }),
}));
vi.mock('../../src/policy/timeline', () => ({ timelineOf: () => ({ engine: 'stub' }) }));
vi.mock('../../src/policy/engine', () => ({
  fetchPolicyProgram: async () => ({ program: {}, netlists: new Map([[7n, NETLIST]]) }),
  programEngine: () => ({}),
  modelEngine: () => ({}),
}));

const { verifyVault } = await import('../../src/verify/vault');

const CPU = getAddress('0x1111111111111111111111111111111111111111');
const BEACON = getAddress('0x2222222222222222222222222222222222222222');
const TRANSISTORS = getAddress('0x4444444444444444444444444444444444444444');
const FACTORY = getAddress('0x3333333333333333333333333333333333333333');
const IMPL = getAddress('0x5555555555555555555555555555555555555555');
const VAULT = getAddress('0x6666666666666666666666666666666666666666');
const NETLIST = Uint8Array.of(1, 2, 3);
const ZERO = getAddress('0x0000000000000000000000000000000000000000');

const revertError = () =>
  new RpcRequestError({ body: {}, url: 'https://rpc.example', error: { code: 3, message: 'execution reverted' } });
const rateLimit = () =>
  new RpcRequestError({ body: {}, url: 'https://rpc.example', error: { code: -32005, message: 'limit exceeded' } });

const tapeout = {
  factory: FACTORY,
  beacon: BEACON,
  beaconSlot: `0x${'00'.repeat(32)}` as const,
  name: 'N',
  symbol: 'S',
};
const deployment: Deployment = { ...getDeployment('local'), tapeout, factory: FACTORY, vaultImpl: IMPL, cpu: CPU };

type Answers = Record<string, unknown>;

/** A client whose reads answer from `a`, keyed by `functionName`; a value that is an Error is thrown. */
function client(a: Answers): PublicClient {
  return {
    getStorageAt: async () => `0x${'00'.repeat(12)}${BEACON.slice(2)}`,
    getCode: async () => '0x6000',
    readContract: async ({ functionName }: { functionName: string }) => {
      const v = a[functionName];
      if (v instanceof Error) throw v;
      return v;
    },
  } as unknown as PublicClient;
}

const good: Answers = {
  isCPU: true,
  name: 'N',
  symbol: 'S',
  transistors: TRANSISTORS,
  owner: ZERO,
  circuits: CPU,
};

describe('readCpuCheck', () => {
  const run = (a: Answers) => readCpuCheck(client({ ...good, ...a }), deployment, CPU, 1n);

  it('accepts the frozen Atropyle CPU', async () => {
    expect(await run({})).toMatchObject({ ok: true, beaconFrozen: true, transistorsPaired: true });
  });

  it('fails when the beacon has an owner, or owner() reverts', async () => {
    expect(await run({ owner: TRANSISTORS })).toMatchObject({ ok: false, beaconFrozen: false });
    expect(await run({ owner: revertError() })).toMatchObject({ ok: false, beaconFrozen: false });
  });

  it('fails when the transistors are not paired with the CPU', async () => {
    expect(await run({ circuits: BEACON })).toMatchObject({ ok: false, transistorsPaired: false });
    expect(await run({ transistors: revertError() })).toMatchObject({ ok: false, transistorsPaired: false });
  });

  it('fails on a wrong name or a CPU the TapeOut factory does not know', async () => {
    expect(await run({ name: 'other' })).toMatchObject({ ok: false, nameMatches: false });
    expect(await run({ isCPU: false })).toMatchObject({ ok: false, isTapeoutCpu: false });
  });

  it('rethrows a transport error instead of reading it as an answer', async () => {
    await expect(run({ name: rateLimit() })).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });
});

describe('verifyVault: netlists unchanged since the proof', () => {
  const vctx = (): ReadContext => ({
    deployment,
    client: {
      getBlockNumber: async () => 9n,
      getCode: async ({ address }: { address: string }) =>
        address === IMPL ? '0x6001' : (eip1167(IMPL) as `0x${string}`),
      readContract: async ({ functionName }: { functionName: string }) =>
        ({ isVault: true, vaultImpl: IMPL, cpu: CPU, policyId: 7n })[functionName],
    } as unknown as PublicClient,
    token: async () => {
      throw new Error('unused');
    },
    log: () => undefined,
  });
  const proof = (keccak: `0x${string}`): PolicyVerification =>
    ({ ok: true, cpu: CPU, policyId: 7n, netlists: [{ id: 7n, keccak }] }) as unknown as PolicyVerification;
  const local = { ...deployment, vaultImplCodehash: keccak256('0x6001') };
  const run = (keccak: `0x${string}`) =>
    verifyVault({ ...vctx(), deployment: local }, VAULT, 2, async () => proof(keccak));

  it('is ok when the netlist at the vault block is the one that was proved', async () => {
    const r = await run(keccak256(bytesToHex(NETLIST)));
    expect(r.policy).toMatchObject({ status: 'verified', unchanged: true });
    expect(r.ok).toBe(true);
  });

  it('is not ok when a netlist hash changed', async () => {
    const r = await run(keccak256('0xdead'));
    expect(r.policy).toMatchObject({ status: 'verified', unchanged: false });
    expect(r.ok).toBe(false);
  });

  it('rethrows a transport failure of the proof instead of reporting it', async () => {
    await expect(
      verifyVault({ ...vctx(), deployment: local }, VAULT, 2, async () => {
        throw rateLimit();
      }),
    ).rejects.toMatchObject({ code: 'RPC_RATE_LIMITED' });
  });
});
