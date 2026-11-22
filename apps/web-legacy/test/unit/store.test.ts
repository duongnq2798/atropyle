import { describe, expect, it } from 'vitest';
import { memoryKV, readJson, safeKV, writeJson } from '../../src/lib/store';

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
});
