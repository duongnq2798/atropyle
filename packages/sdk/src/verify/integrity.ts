import { type Hex, keccak256, type PublicClient } from 'viem';
import { cpuAbi, factoryAbi } from '../abi/index';
import type { Deployment } from '../deployments/index';
import { decodeError } from '../errors';
import type { Warning } from '../types';
import { orElse, readCpuCheck } from './cpu';
import { MAINNET_CHAIN_ID, SINGLE_RPC_WARNING } from './policy';

export interface IntegrityCheck {
  name: string;
  ok: boolean;
  expected?: string;
  actual?: string;
}

export interface IntegrityReport {
  ok: boolean;
  chainId: number;
  blockNumber: bigint;
  blockTimestamp: bigint;
  rpcs: number;
  checks: IntegrityCheck[];
  warnings: Warning[];
}

const hashOf = (code: Hex | undefined): string => (code && code !== '0x' ? keccak256(code) : 'no code');

export function eqCheck(name: string, expected: string, actual: string): IntegrityCheck {
  return { name, ok: expected.toLowerCase() === actual.toLowerCase(), expected, actual };
}

/** Cheap checks (no 2^26 enumeration), light enough for the Worker cron (spec §5.2, §9.5). */
export async function readIntegrity(c: PublicClient, d: Deployment, rpcs: number): Promise<IntegrityReport> {
  try {
    const blockNumber = await c.getBlockNumber();
    const block = await c.getBlock({ blockNumber });
    const checks: IntegrityCheck[] = [];
    const code = await c.getCode({ address: d.factory, blockNumber });
    checks.push({ name: 'factory.code', ok: !!code && code !== '0x' });
    if (code && code !== '0x') {
      const f = { address: d.factory, abi: factoryAbi, blockNumber } as const;
      const [cpu, policyId, vaultImpl, treasury] = await Promise.all([
        c.readContract({ ...f, functionName: 'cpu' }),
        c.readContract({ ...f, functionName: 'policyId' }),
        c.readContract({ ...f, functionName: 'vaultImpl' }),
        c.readContract({ ...f, functionName: 'treasury' }),
      ]);
      checks.push(
        eqCheck('factory.cpu', d.cpu, cpu),
        eqCheck('factory.policyId', String(d.policyId), String(policyId)),
        eqCheck('factory.vaultImpl', d.vaultImpl, vaultImpl),
        eqCheck('factory.treasury', d.treasury, treasury),
      );
      for (const token of d.feeTokens) {
        const fee = await orElse(c.readContract({ ...f, functionName: 'earlyFee', args: [token] }), 0n);
        checks.push({ name: `factory.feeToken ${token}`, ok: fee > 0n, actual: String(fee) });
      }
    }
    checks.push(
      eqCheck(
        'vaultImpl.codehash',
        d.vaultImplCodehash,
        hashOf(await c.getCode({ address: d.vaultImpl, blockNumber })),
      ),
    );
    if (d.tapeout) {
      const cc = await readCpuCheck(c, d, d.cpu, blockNumber);
      checks.push(
        { name: 'cpu.tapeout', ok: cc.isTapeoutCpu },
        {
          name: 'cpu.nameSymbol',
          ok: cc.nameMatches && cc.symbolMatches,
          expected: `${d.tapeout.name}/${d.tapeout.symbol}`,
        },
        eqCheck('cpu.beacon', d.tapeout.beacon, cc.beacon),
        { name: 'beacon.frozen', ok: cc.beaconFrozen },
        { name: 'cpu.transistors', ok: cc.transistorsPaired },
      );
    } else if (d.chainId === MAINNET_CHAIN_ID) {
      // Without TapeOut info the frozen-CPU check cannot run: not verifiable.
      checks.push({ name: 'deployment.tapeout', ok: false, expected: 'present', actual: 'missing' });
    }
    if (d.circuits) {
      const at = { address: d.cpu, abi: cpuAbi, blockNumber } as const;
      const roles = [
        ['policy', d.policyId],
        ['kofn5', d.circuits.kofn5],
        ['ge4', d.circuits.ge4],
      ] as const;
      for (const [role, id] of roles) {
        const bytes = await c.readContract({ ...at, functionName: 'netlist', args: [id] });
        checks.push(eqCheck(`netlist.${role}`, d.circuits.netlistKeccak[role], hashOf(bytes)));
      }
    } else if (d.chainId === MAINNET_CHAIN_ID) {
      // Without recorded circuit ids and hashes there is nothing to compare the netlists with: not verifiable.
      checks.push({ name: 'deployment.circuits', ok: false, expected: 'present', actual: 'missing' });
    }
    return {
      ok: checks.every((x) => x.ok),
      chainId: d.chainId,
      blockNumber,
      blockTimestamp: block.timestamp,
      rpcs,
      checks,
      warnings: rpcs < 2 ? [SINGLE_RPC_WARNING] : [],
    };
  } catch (e) {
    throw decodeError(e);
  }
}
