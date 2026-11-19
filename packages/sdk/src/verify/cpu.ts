import { type Address, getAddress, type PublicClient } from 'viem';
import { beaconAbi, cpuAbi, tapeoutCircuitsAbi, tapeoutFactoryAbi, transistorsAbi } from '../abi/index';
import { sameAddress, ZERO_ADDRESS } from '../address';
import type { Deployment } from '../deployments/index';
import { AtropyleError, decodeError, isContractAnswer } from '../errors';

export interface CpuCheck {
  ok: boolean;
  isTapeoutCpu: boolean;
  nameMatches: boolean;
  symbolMatches: boolean;
  beacon: Address;
  beaconMatches: boolean;
  /** The beacon has no owner, so nobody can upgrade the CPU's circuits code. */
  beaconFrozen: boolean;
  transistorsPaired: boolean;
}

/**
 * A contract answer we can do without (a non-standard contract). Anything that is not the contract's own answer
 * (a throttled RPC, a quorum outage, a malformed response) is rethrown, never read as the fallback.
 */
export async function orElse<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (!isContractAnswer(e)) throw decodeError(e);
    return fallback;
  }
}

/**
 * Read-only version of TapeoutFlow.requireAtropyleCpu (Plan 1), except for its creator check. The creator is not
 * checked because `Deployment` has no expected-creator field, and because factory.cpu() is immutable while the beacon
 * is frozen and the netlists are verified byte for byte: a CPU someone else made would fail those checks anyway.
 */
export async function readCpuCheck(
  c: PublicClient,
  d: Deployment,
  cpu: Address,
  blockNumber: bigint,
): Promise<CpuCheck> {
  const t = d.tapeout;
  if (!t) throw new AtropyleError('INVALID_OPTIONS', { message: 'readCpuCheck needs a deployment with TapeOut info.' });
  const [isTapeoutCpu, name, symbol, slot, transistors] = await Promise.all([
    orElse(
      c.readContract({ address: t.factory, abi: tapeoutFactoryAbi, functionName: 'isCPU', args: [cpu], blockNumber }),
      false,
    ),
    orElse(c.readContract({ address: cpu, abi: tapeoutCircuitsAbi, functionName: 'name', blockNumber }), ''),
    orElse(c.readContract({ address: cpu, abi: tapeoutCircuitsAbi, functionName: 'symbol', blockNumber }), ''),
    c.getStorageAt({ address: cpu, slot: t.beaconSlot, blockNumber }),
    orElse(c.readContract({ address: cpu, abi: cpuAbi, functionName: 'transistors', blockNumber }), ZERO_ADDRESS),
  ]);
  const beacon = getAddress(`0x${(slot ?? '0x').slice(2).padStart(64, '0').slice(24)}`);
  const [owner, paired] = await Promise.all([
    orElse(
      c.readContract({ address: beacon, abi: beaconAbi, functionName: 'owner', blockNumber }),
      null as Address | null,
    ),
    orElse(
      c.readContract({ address: transistors, abi: transistorsAbi, functionName: 'circuits', blockNumber }),
      ZERO_ADDRESS,
    ),
  ]);
  const r = {
    isTapeoutCpu,
    nameMatches: name === t.name,
    symbolMatches: symbol === t.symbol,
    beacon,
    beaconMatches: sameAddress(beacon, t.beacon),
    // A beacon without owner() counts as not frozen: the check leans to the safe side.
    beaconFrozen: owner !== null && sameAddress(owner, ZERO_ADDRESS),
    transistorsPaired: !sameAddress(transistors, ZERO_ADDRESS) && sameAddress(paired, cpu),
  };
  return {
    ...r,
    ok: r.isTapeoutCpu && r.nameMatches && r.symbolMatches && r.beaconMatches && r.beaconFrozen && r.transistorsPaired,
  };
}
