import { type Address, bytesToHex, getAddress, type Hex, hexToBytes, isHex } from 'viem';
import { toAddress } from '../address';
import { AtropyleError } from '../errors';

export interface SignStep {
  to: Address;
  data: Hex;
  value: bigint;
}

/** Everything a #/sign link carries (spec §15). The page re-derives every summary from it. */
export interface SignPayload {
  chainId: number;
  from: Address;
  steps: SignStep[];
}

export const PAYLOAD_VERSION = 1;
export const PAYLOAD_LIMITS = { steps: 32, stepData: 32_768, bytes: 98_304 } as const;

const MAX_UINT256 = 2n ** 256n - 1n;

function invalid(why: string): never {
  throw new AtropyleError('LINK_INVALID', { message: `The signing link is invalid: ${why}.` });
}

function unencodable(why: string): never {
  throw new AtropyleError('INVALID_OPTIONS', { message: `This plan cannot be put in a signing link: ${why}.` });
}

function writeUvarint(out: number[], value: bigint): void {
  let v = value;
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
}

/**
 * version (1 byte) ‖ uvarint chainId ‖ from (20) ‖ uvarint n ‖ n × (to (20) ‖ uvarint value ‖ uvarint len ‖ data).
 * Binary rather than JSON: calldata takes half the characters, so links stay short enough for QR codes and chats.
 * Whatever would not read back as the same payload is refused here, so a link never carries a changed transaction.
 */
export function payloadBytes(p: SignPayload): Uint8Array {
  if (p.steps.length === 0 || p.steps.length > PAYLOAD_LIMITS.steps) {
    unencodable(`it has ${p.steps.length} steps (1 to ${PAYLOAD_LIMITS.steps})`);
  }
  if (!Number.isSafeInteger(p.chainId) || p.chainId <= 0) unencodable('the chain id is not a positive integer');
  const out: number[] = [PAYLOAD_VERSION];
  writeUvarint(out, BigInt(p.chainId));
  out.push(...hexToBytes(toAddress(p.from, 'from')));
  writeUvarint(out, BigInt(p.steps.length));
  for (const [i, s] of p.steps.entries()) {
    out.push(...hexToBytes(toAddress(s.to, `steps[${i}].to`)));
    if (typeof s.value !== 'bigint' || s.value < 0n || s.value > MAX_UINT256) {
      unencodable(`step ${i + 1} has a value outside 0 to 2^256 - 1`);
    }
    writeUvarint(out, s.value);
    if (!isHex(s.data) || s.data.length % 2 !== 0) {
      unencodable(`step ${i + 1} has calldata that is not whole bytes of hex`);
    }
    const data = hexToBytes(s.data);
    if (data.length > PAYLOAD_LIMITS.stepData) unencodable(`step ${i + 1} has ${data.length} bytes of calldata`);
    writeUvarint(out, BigInt(data.length));
    for (const b of data) out.push(b);
  }
  if (out.length > PAYLOAD_LIMITS.bytes) unencodable(`it is ${out.length} bytes long`);
  return Uint8Array.from(out);
}

export function parsePayloadBytes(b: Uint8Array): SignPayload {
  if (b.length > PAYLOAD_LIMITS.bytes) invalid('it is too large');
  let p = 0;
  const byte = (): number => {
    if (p >= b.length) invalid('it is truncated');
    return b[p++];
  };
  const take = (n: number): Uint8Array => {
    if (p + n > b.length) invalid('it is truncated');
    const s = b.subarray(p, p + n);
    p += n;
    return s;
  };
  const uvarint = (maxBytes: number): bigint => {
    let v = 0n;
    for (let i = 0; i < maxBytes; i++) {
      const x = byte();
      v |= BigInt(x & 0x7f) << BigInt(7 * i);
      if ((x & 0x80) === 0) {
        if (i > 0 && x === 0) invalid('a number is not minimally encoded');
        return v;
      }
    }
    return invalid('a number is too long');
  };
  const address = (): Address => getAddress(bytesToHex(take(20)));

  if (byte() !== PAYLOAD_VERSION) invalid('unknown version');
  const chainId = uvarint(8);
  if (chainId === 0n || chainId > BigInt(Number.MAX_SAFE_INTEGER)) invalid('bad chain id');
  const from = address();
  const n = Number(uvarint(2));
  if (n === 0 || n > PAYLOAD_LIMITS.steps) invalid(`it has ${n} steps`);
  const steps: SignStep[] = [];
  for (let i = 0; i < n; i++) {
    const to = address();
    const value = uvarint(37);
    if (value > MAX_UINT256) invalid('a value does not fit in uint256');
    const len = Number(uvarint(3));
    if (len > PAYLOAD_LIMITS.stepData) invalid('a step has too much calldata');
    steps.push({ to, value, data: bytesToHex(take(len)) });
  }
  if (p !== b.length) invalid('it has trailing bytes');
  return { chainId: Number(chainId), from, steps };
}

export function toBase64Url(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  if (s.length === 0 || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) invalid('it is not base64url');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const encodePayload = (p: SignPayload): string => toBase64Url(payloadBytes(p));
export const decodePayload = (s: string): SignPayload => parsePayloadBytes(fromBase64Url(s));
