import { stringify } from '@atropyle/sdk';

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
        // the memory copy above is enough
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
  kv.set(key, stringify(value));
}

export const KEYS = { lang: 'atropyle:lang', crossCheck: 'atropyle:crossCheck' } as const;
