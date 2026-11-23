import { describe, expect, it } from 'vitest';
import { jsonStringify, KEYS, memoryKV, readJson, safeKV, writeJson } from '../../src/lib/store';

describe('store', () => {
  it('keeps values in memory', () => {
    const kv = memoryKV();
    kv.set('a', '1');
    expect(kv.get('a')).toBe('1');
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
  });

  it('falls back to memory when localStorage throws', () => {
    const kv = safeKV(() => {
      throw new Error('SecurityError');
    });
    kv.set('a', '1');
    expect(kv.get('a')).toBe('1');
  });

  it('falls back to memory when there is no storage', () => {
    const kv = safeKV(() => null);
    kv.set('b', '2');
    expect(kv.get('b')).toBe('2');
  });

  it('falls back to memory when every storage call throws (quota, blocked site data)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const kv = safeKV(() => broken);
    kv.set('c', '3');
    expect(kv.get('c')).toBe('3');
    kv.remove('c');
    expect(kv.get('c')).toBeNull();
  });

  it('writes bigint values as strings and drops corrupt entries', () => {
    const kv = memoryKV();
    writeJson(kv, 'x', { n: 10n });
    expect(kv.get('x')).toBe('{"n":"10"}');
    expect(readJson(kv, 'x', (raw) => (raw as { n: string }).n)).toBe('10');
    kv.set('bad', '{nope');
    expect(readJson(kv, 'bad', () => 1)).toBeNull();
    expect(kv.get('bad')).toBeNull();
    kv.set('old', '{"v":0}');
    expect(readJson(kv, 'old', () => null)).toBeNull();
    expect(kv.get('old')).toBeNull();
  });

  it('serialises bytes as 0x hex and drops undefined members', () => {
    expect(jsonStringify({ b: new Uint8Array([0, 15, 255]), u: undefined, a: [1n] })).toBe(
      '{"b":"0x000fff","a":["1"]}',
    );
  });

  it('namespaces every key', () => {
    for (const key of Object.values(KEYS)) expect(key).toMatch(/^atropyle:[a-zA-Z]+$/);
    expect(new Set(Object.values(KEYS)).size).toBe(Object.values(KEYS).length);
  });
});
