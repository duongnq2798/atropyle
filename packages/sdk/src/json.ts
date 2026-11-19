import { AtropyleError } from './errors';

const HEX = '0123456789abcdef';

/** Deep copy with bigint → decimal string and bytes → 0x hex, safe for JSON.stringify. */
export function toJson(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10);
  if (value instanceof Uint8Array) {
    let s = '0x';
    for (const b of value) s += HEX[b >> 4] + HEX[b & 15];
    return s;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = toJson(v);
    }
    return out;
  }
  return value;
}

export function stringify(value: unknown, space?: number): string {
  return JSON.stringify(toJson(value), null, space);
}

export function parseBigInt(value: unknown, path: string): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && (/^\d+$/.test(value) || /^0x[0-9a-fA-F]+$/.test(value))) return BigInt(value);
  throw new AtropyleError('PLAN_INVALID', {
    message: `${path}: expected a non-negative integer`,
    details: { path },
  });
}
