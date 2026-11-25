import { type Address, getAddress, type Hex, keccak256, type PublicClient } from 'viem';
import { beaconAbi, cpuAbi, tapeoutCircuitsAbi, tapeoutFactoryAbi, transistorsAbi } from '../abi/index';
import { sameAddress, ZERO_ADDRESS } from '../address';
import type { Deployment } from '../deployments/index';
import { AtropyleError, decodeError, isContractAnswer } from '../errors';
import { codePinFor } from './pins';

/** The runtime code behind the processor, compared with the values this SDK pins (verify/pins.ts). */
export interface CodeCheck {
  /** keccak256 of the processor proxy's runtime code; null when the address has no code. */
  proxyCodehash: Hex | null;
  /** beacon.implementation() at the same block; the zero address when the beacon does not answer. */
  implementation: Address;
  /** keccak256 of the implementation's runtime code; null when it has no code. */
  implementationCodehash: Hex | null;
  /** The pinned values; null when this SDK pins nothing for this processor. */
  expected: { proxyCodehash: Hex; implementation: Address; implementationCodehash: Hex } | null;
  /** The proxy hash, the implementation and its hash all equal their pins; null when nothing is pinned. */
  matches: boolean | null;
}

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
  code: CodeCheck;
}

export const codehashOf = (code: Hex | undefined): Hex | null => (code && code !== '0x' ? keccak256(code) : null);

function codeCheck(
  d: Deployment,
  cpu: Address,
  proxyCodehash: Hex | null,
  implementation: Address,
  implementationCodehash: Hex | null,
): CodeCheck {
  const pin = codePinFor(d.chainId, cpu);
  const expected = pin && {
    proxyCodehash: pin.proxyCodehash,
    implementation: pin.implementation,
    implementationCodehash: pin.implementationCodehash,
  };
  const same = (a: Hex | null, b: Hex) => a !== null && a.toLowerCase() === b.toLowerCase();
  return {
    proxyCodehash,
    implementation,
    implementationCodehash,
    expected,
    matches:
      expected === null
        ? null
        : same(proxyCodehash, expected.proxyCodehash) &&
          sameAddress(implementation, expected.implementation) &&
          same(implementationCodehash, expected.implementationCodehash),
  };
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
  const [isTapeoutCpu, name, symbol, slot, transistors, proxyCode] = await Promise.all([
    orElse(
      c.readContract({ address: t.factory, abi: tapeoutFactoryAbi, functionName: 'isCPU', args: [cpu], blockNumber }),
      false,
    ),
    orElse(c.readContract({ address: cpu, abi: tapeoutCircuitsAbi, functionName: 'name', blockNumber }), ''),
    orElse(c.readContract({ address: cpu, abi: tapeoutCircuitsAbi, functionName: 'symbol', blockNumber }), ''),
    c.getStorageAt({ address: cpu, slot: t.beaconSlot, blockNumber }),
    orElse(c.readContract({ address: cpu, abi: cpuAbi, functionName: 'transistors', blockNumber }), ZERO_ADDRESS),
    c.getCode({ address: cpu, blockNumber }),
  ]);
  const beacon = getAddress(`0x${(slot ?? '0x').slice(2).padStart(64, '0').slice(24)}`);
  const [owner, paired, implementation] = await Promise.all([
    orElse(
      c.readContract({ address: beacon, abi: beaconAbi, functionName: 'owner', blockNumber }),
      null as Address | null,
    ),
    orElse(
      c.readContract({ address: transistors, abi: transistorsAbi, functionName: 'circuits', blockNumber }),
      ZERO_ADDRESS,
    ),
    orElse(
      c.readContract({ address: beacon, abi: beaconAbi, functionName: 'implementation', blockNumber }),
      ZERO_ADDRESS,
    ),
  ]);
  const implCode = sameAddress(implementation, ZERO_ADDRESS)
    ? undefined
    : await c.getCode({ address: implementation, blockNumber });
  const r = {
    isTapeoutCpu,
    nameMatches: name === t.name,
    symbolMatches: symbol === t.symbol,
    beacon,
    beaconMatches: sameAddress(beacon, t.beacon),
    // A beacon without owner() counts as not frozen: the check leans to the safe side.
    beaconFrozen: owner !== null && sameAddress(owner, ZERO_ADDRESS),
    transistorsPaired: !sameAddress(transistors, ZERO_ADDRESS) && sameAddress(paired, cpu),
    code: codeCheck(d, cpu, codehashOf(proxyCode), implementation, codehashOf(implCode)),
  };
  return {
    ...r,
    // A processor without pins is judged by the caller (mainnet requires them); a pin that does not match fails here.
    ok:
      r.isTapeoutCpu &&
      r.nameMatches &&
      r.symbolMatches &&
      r.beaconMatches &&
      r.beaconFrozen &&
      r.transistorsPaired &&
      r.code.matches !== false,
  };
}
