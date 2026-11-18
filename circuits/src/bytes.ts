/** Byte helpers shared by the builder and the simulator. Multi-byte integers are big-endian (NetlistVM). */

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Little-endian bit order; bytes past the end read as 0 (NetlistVM._getBit). */
export function getBit(b: Uint8Array, i: number): number {
  const j = i >> 3;
  return j < b.length ? (b[j] >> (i & 7)) & 1 : 0;
}

export function setBit(b: Uint8Array, i: number): void {
  b[i >> 3] |= 1 << (i & 7);
}

export function u24(b: Uint8Array, p: number): number {
  return (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
}

export function u64(b: Uint8Array, p: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[p + i]);
  return v;
}

export function addrAt(b: Uint8Array, p: number): string {
  return bytesToHex(b.subarray(p, p + 20));
}

export class ByteWriter {
  private readonly buf: number[] = [];

  get length(): number {
    return this.buf.length;
  }

  u8(x: number): void {
    if (!Number.isInteger(x) || x < 0 || x > 0xff) throw new Error(`u8 out of range: ${x}`);
    this.buf.push(x);
  }

  u24(x: number): void {
    checkU24(x);
    this.buf.push((x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
  }

  set24(pos: number, x: number): void {
    checkU24(x);
    this.buf[pos] = (x >>> 16) & 0xff;
    this.buf[pos + 1] = (x >>> 8) & 0xff;
    this.buf[pos + 2] = x & 0xff;
  }

  u64(x: bigint): void {
    if (x < 0n || x >= 1n << 64n) throw new Error('u64 out of range');
    for (let i = 7; i >= 0; i--) this.buf.push(Number((x >> BigInt(8 * i)) & 0xffn));
  }

  addr(hex: string): void {
    const b = hexToBytes(hex);
    if (b.length !== 20) throw new Error('address must be 20 bytes');
    for (const x of b) this.buf.push(x);
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

function checkU24(x: number): void {
  if (!Number.isInteger(x) || x < 0 || x > 0xffffff) throw new Error(`u24 out of range: ${x}`);
}
