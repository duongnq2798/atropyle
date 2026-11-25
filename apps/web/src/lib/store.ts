export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v);
    },
    remove: (k) => {
      m.delete(k);
    },
  };
}

/** localStorage when it works; private windows, blocked storage and full quotas fall back to memory. */
export function safeKV(storage: () => Storage | null | undefined): KV {
  const mem = memoryKV();
  const s = (): Storage | null => {
    try {
      return storage() ?? null;
    } catch {
      return null;
    }
  };
  return {
    get: (k) => {
      try {
        return s()?.getItem(k) ?? mem.get(k);
      } catch {
        return mem.get(k);
      }
    },
    set: (k, v) => {
      mem.set(k, v);
      try {
        s()?.setItem(k, v);
      } catch {
        // The memory copy above is enough, once an older stored copy cannot hide it: get() reads storage first.
        try {
          s()?.removeItem(k);
        } catch {
          // nothing stored
        }
      }
    },
    remove: (k) => {
      mem.remove(k);
      try {
        s()?.removeItem(k);
      } catch {
        // nothing stored
      }
    },
  };
}

const HEX = '0123456789abcdef';

function toJson(value: unknown): unknown {
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

/** Same output as `stringify` of @atropyle/sdk (bigint → decimal string, bytes → 0x hex), without loading the SDK. */
export function jsonStringify(value: unknown, space?: number): string {
  return JSON.stringify(toJson(value), null, space);
}

export function readJson<T>(kv: KV, key: string, revive: (raw: unknown) => T | null): T | null {
  const text = kv.get(key);
  if (text === null) return null;
  try {
    const value = revive(JSON.parse(text));
    if (value !== null) return value;
  } catch {
    // corrupt entry: removed below
  }
  kv.remove(key);
  return null;
}

export function writeJson(kv: KV, key: string, value: unknown): void {
  kv.set(key, jsonStringify(value));
}

export const KEYS = {
  lang: 'atropyle:lang',
  crossCheck: 'atropyle:crossCheck',
  theme: 'atropyle:theme',
  haptics: 'atropyle:haptics',
  wallet: 'atropyle:wallet',
  stats: 'atropyle:stats',
} as const;
