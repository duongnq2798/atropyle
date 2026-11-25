import { type Address, getAddress, type Hex } from 'viem';
import { sameAddress } from '../address';

/** Runtime code that `verify` expects behind the ATRO processor of one chain. */
export interface CodePin {
  /** The processor's beacon proxy, deployment.cpu. */
  cpu: Address;
  /** keccak256 of the proxy's runtime code (eth_getCode). */
  proxyCodehash: Hex;
  /** What the processor's frozen beacon returns from implementation(). */
  implementation: Address;
  /** keccak256 of the implementation's runtime code (eth_getCode). */
  implementationCodehash: Hex;
}

/**
 * Pinned from a chain read on 25 Nov 2026 at block 76825210 (08:10:46 UTC) of X Layer, with identical answers from
 * rpc.xlayer.tech and xlayerrpc.okx.com: eth_getCode of the proxy (295 bytes) and of the implementation (12,562
 * bytes), and implementation() of the beacon 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C, whose owner() was 0x0.
 */
export const CODE_PINS: Readonly<Record<number, CodePin>> = {
  196: {
    cpu: '0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05',
    proxyCodehash: '0x8c799a18cd8e0d5f5f3c0cec4fbc145e2daf79f70c2b131c09d0f380921db545',
    implementation: '0x977f217887E085D298Cb3819cDAD5A0ee35F29B2',
    implementationCodehash: '0x7a15c353205e5245f40f5f5524542a982a4bb3b9a28476e4f10845163f941b30',
  },
};

/** The pin for `cpu` on `chainId`, or null when this SDK pins nothing for that processor. */
export function codePinFor(chainId: number, cpu: Address): CodePin | null {
  const pin = CODE_PINS[chainId];
  return pin && sameAddress(pin.cpu, cpu) ? pin : null;
}

/** Multicall3, at the same address on most EVM chains. */
export const MULTICALL3: Address = getAddress('0xcA11bde05977b3631167028862bE2a173976CA11');

/**
 * keccak256 of the canonical Multicall3 runtime code. Read on 25 Nov 2026 at block 76825210 of X Layer from
 * rpc.xlayer.tech and xlayerrpc.okx.com (and the same hash from xlayer.drpc.org at its latest block). P9 batches its
 * calls through Multicall3 only when the code at MULTICALL3 has this hash, since other code could answer anything.
 */
export const MULTICALL3_CODEHASH: Hex = '0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891';
