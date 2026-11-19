import { type Address, keccak256 } from 'viem';
import { cpuAbi, factoryAbi } from '../abi/index';
import { AtropyleError, type AtropyleErrorJson, decodeError } from '../errors';
import { fetchPolicyProgram, modelEngine, programEngine } from '../policy/engine';
import { type Timeline, timelineOf } from '../policy/timeline';
import type { ReadContext } from '../read/context';
import { netlistSource } from '../read/netlists';
import { readSnapshot } from '../read/snapshot';
import type { VaultSnapshot } from '../read/types';
import type { Warning } from '../types';
import { eqCheck, type IntegrityCheck } from './integrity';
import { type PolicyVerification, SINGLE_RPC_WARNING } from './policy';

export type PolicyPart =
  | { status: 'verified'; result: PolicyVerification; unchanged: boolean }
  | { status: 'unavailable'; error: AtropyleErrorJson }
  | { status: 'skipped' };

export interface VaultVerification {
  ok: boolean;
  vault: Address;
  chainId: number;
  blockNumber: bigint;
  rpcs: number;
  checks: IntegrityCheck[];
  policy: PolicyPart;
  snapshot: VaultSnapshot;
  timeline: Timeline;
  warnings: Warning[];
}

/** Runtime code of an OpenZeppelin Clones (EIP-1167) proxy. */
export const eip1167 = (impl: Address) =>
  `0x363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;

/** Spec §5.4 `vault(addr).verify()`: every read at one quorum block; `policy` may come from the session cache. */
export async function verifyVault(
  vctx: ReadContext,
  vault: Address,
  rpcs: number,
  policy: (() => Promise<PolicyVerification>) | null,
): Promise<VaultVerification> {
  try {
    const c = vctx.client;
    const d = vctx.deployment;
    const blockNumber = await c.getBlockNumber();
    const f = { address: d.factory, abi: factoryAbi, blockNumber } as const;
    const [isVault, impl, cpu, policyId] = await Promise.all([
      c.readContract({ ...f, functionName: 'isVault', args: [vault] }),
      c.readContract({ ...f, functionName: 'vaultImpl' }),
      c.readContract({ ...f, functionName: 'cpu' }),
      c.readContract({ ...f, functionName: 'policyId' }),
    ]);
    if (!isVault) {
      throw new AtropyleError('NOT_VAULT', {
        message: `${vault} was not created by the Atropyle factory ${d.factory}.`,
        details: { vault },
      });
    }
    const [code, implCode] = await Promise.all([
      c.getCode({ address: vault, blockNumber }),
      c.getCode({ address: impl, blockNumber }),
    ]);
    const snapshot = await readSnapshot(vctx, vault, blockNumber);
    const checks: IntegrityCheck[] = [
      { name: 'factory.isVault', ok: true },
      eqCheck('vault.proxy', eip1167(impl), code ?? '0x'),
      eqCheck('vault.factory', d.factory, snapshot.binding.factory),
      eqCheck('vault.cpu', cpu, snapshot.binding.cpu),
      eqCheck('vault.policyId', String(policyId), String(snapshot.binding.policyId)),
      eqCheck(
        'vaultImpl.codehash',
        d.vaultImplCodehash,
        implCode && implCode !== '0x' ? keccak256(implCode) : 'no code',
      ),
    ];

    let part: PolicyPart = { status: 'skipped' };
    if (policy) {
      try {
        const result = await policy();
        let unchanged =
          result.cpu.toLowerCase() === snapshot.binding.cpu.toLowerCase() &&
          result.policyId === snapshot.binding.policyId;
        for (const n of result.netlists) {
          const bytes = await c.readContract({
            address: snapshot.binding.cpu,
            abi: cpuAbi,
            functionName: 'netlist',
            args: [n.id],
            blockNumber,
          });
          if (keccak256(bytes) !== n.keccak) unchanged = false;
        }
        part = { status: 'verified', result, unchanged };
      } catch (e) {
        // Only "this CPU has no netlist" is a finding; a transport failure or quorum outage is thrown as such.
        const err = decodeError(e);
        if (err.code !== 'POLICY_UNAVAILABLE') throw err;
        part = { status: 'unavailable', error: err.toJSON() };
      }
    }

    const fetched = await fetchPolicyProgram(
      snapshot.binding.cpu,
      snapshot.binding.policyId,
      netlistSource(c, snapshot.binding.cpu, blockNumber),
    );
    const timeline = timelineOf(fetched ? programEngine(fetched.program) : modelEngine(), snapshot);
    const policyOk = part.status === 'skipped' || (part.status === 'verified' && part.result.ok && part.unchanged);
    return {
      ok: checks.every((x) => x.ok) && policyOk,
      vault,
      chainId: d.chainId,
      blockNumber,
      rpcs,
      checks,
      policy: part,
      snapshot,
      timeline,
      warnings: rpcs < 2 ? [SINGLE_RPC_WARNING] : [],
    };
  } catch (e) {
    throw decodeError(e);
  }
}
