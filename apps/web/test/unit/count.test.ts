import { describe, expect, it } from 'vitest';
import { formatCount } from '../../src/lib/count';

describe('formatCount', () => {
  it('groups digits as each language writes them, numbers and bigints alike', () => {
    expect(formatCount(67_108_864, 'en')).toBe('67,108,864');
    expect(formatCount(67_108_864, 'vi')).toBe('67.108.864');
    expect(formatCount(2n ** 26n, 'en')).toBe('67,108,864');
    expect(formatCount(18.193, 'en', 1)).toBe('18.2');
    expect(formatCount(18.193, 'vi', 1)).toBe('18,2');
  });
});
