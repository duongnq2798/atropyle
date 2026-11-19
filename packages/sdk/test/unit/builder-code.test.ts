import { Attribution } from 'ox/erc8021';
import { describe, expect, it } from 'vitest';
import { appendSuffix, builderCodeSuffix, ERC8021_MARKER, parseBuilderCodeSuffix } from '../../src/index';

describe('ERC-8021 builder code suffix', () => {
  it('matches ox for one and several codes', () => {
    for (const codes of [['atropyle'], ['atropyle', 'okx-wallet'], ['a']]) {
      expect(builderCodeSuffix(codes).toLowerCase()).toBe(Attribution.toDataSuffix({ codes }).toLowerCase());
    }
  });

  it('encodes codes ‖ length ‖ schema 0 ‖ marker', () => {
    expect(builderCodeSuffix('baseapp')).toBe(`0x626173656170700700${ERC8021_MARKER}`);
  });

  it('round-trips through calldata', () => {
    const data = '0x183ff085';
    const tagged = appendSuffix(data, builderCodeSuffix(['atropyle', 'x']));
    expect(parseBuilderCodeSuffix(tagged)).toEqual({ codes: ['atropyle', 'x'], data });
    expect(parseBuilderCodeSuffix(data)).toBeNull();
    expect(appendSuffix(data, null)).toBe(data);
  });

  it('rejects codes that are empty, contain commas, spaces or non-ASCII', () => {
    for (const bad of ['', 'a,b', 'has space', 'é', 'x'.repeat(256)]) {
      expect(() => builderCodeSuffix(bad)).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
    }
  });
});
