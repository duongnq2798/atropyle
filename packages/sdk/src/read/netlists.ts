import { type Address, hexToBytes, type PublicClient } from 'viem';
import { cpuAbi } from '../abi/index';
import { decodeError } from '../errors';
import type { NetlistSource } from '../policy/engine';

/**
 * Netlist reads of one CPU. A failure leaves as an AtropyleError, never as a raw viem error: a throttled or dead
 * RPC is RPC_RATE_LIMITED / RPC_UNAVAILABLE (transport errors), a contract revert carries its own code.
 */
export function netlistSource(c: PublicClient, cpu: Address, blockNumber?: bigint): NetlistSource {
  const at = { address: cpu, abi: cpuAbi, blockNumber } as const;
  return {
    netlist: async (id) => {
      try {
        return hexToBytes(await c.readContract({ ...at, functionName: 'netlist', args: [id] }));
      } catch (e) {
        throw decodeError(e);
      }
    },
    info: async (id) => {
      try {
        const [nIn, nOut] = await c.readContract({ ...at, functionName: 'circuitInfo', args: [id] });
        return { nIn: Number(nIn), nOut: Number(nOut) };
      } catch (e) {
        throw decodeError(e);
      }
    },
  };
}
