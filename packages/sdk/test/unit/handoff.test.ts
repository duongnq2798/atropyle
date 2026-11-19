import { bytesToHex, hexToBytes } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  castCommand,
  decodePayload,
  encodePayload,
  fromBase64Url,
  okxCommand,
  parseSignLink,
  payloadBytes,
  type SignPayload,
  sendCallsParams,
  signLink,
  toBase64Url,
} from '../../src/handoff/index';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const one: SignPayload = { chainId: 196, from: A, steps: [{ to: B, data: '0x183ff085', value: 0n }] };
const hexOf = (p: SignPayload) => bytesToHex(payloadBytes(p));
const fromHex = (h: string) => toBase64Url(hexToBytes(h as `0x${string}`));
const invalid = expect.objectContaining({ code: 'LINK_INVALID' });
const badOptions = expect.objectContaining({ code: 'INVALID_OPTIONS' });
const withStep = (step: Partial<SignPayload['steps'][number]>): SignPayload => ({
  ...one,
  steps: [{ ...one.steps[0], ...step }],
});

describe('sign payload', () => {
  it('has a fixed binary layout: version, chainId, from, steps', () => {
    expect(hexOf(one)).toBe(`0x01c401${'11'.repeat(20)}01${'22'.repeat(20)}0004183ff085`);
  });

  it('uses unpadded base64url', () => {
    expect(toBase64Url(Uint8Array.of(0xfb, 0xff))).toBe('-_8');
    expect([...fromBase64Url('-_8')]).toEqual([0xfb, 0xff]);
  });

  it('round-trips several steps, large values and long calldata', () => {
    const p: SignPayload = {
      chainId: 31337,
      from: A,
      steps: [
        { to: B, data: '0x', value: 10n ** 18n },
        { to: A, data: `0x${'ab'.repeat(3000)}`, value: 2n ** 256n - 1n },
      ],
    };
    expect(decodePayload(encodePayload(p))).toEqual(p);
  });

  it('rejects damaged payloads', () => {
    const h = hexOf(one);
    expect(() => decodePayload(fromHex(h.slice(0, -2)))).toThrow(invalid);
    expect(() => decodePayload(fromHex(`${h}00`))).toThrow(invalid);
    expect(() => decodePayload(fromHex(`0x02${h.slice(4)}`))).toThrow(invalid);
    expect(() => decodePayload(fromHex(`0x01c48100${h.slice(8)}`))).toThrow(invalid);
    expect(() => decodePayload('not base64!')).toThrow(invalid);
    expect(() => decodePayload('')).toThrow(invalid);
  });

  it('refuses to encode plans over the limits', () => {
    const many: SignPayload = { ...one, steps: Array.from({ length: 33 }, () => one.steps[0]) };
    expect(() => encodePayload(many)).toThrow(badOptions);
    expect(() => encodePayload({ ...one, steps: [] })).toThrow(badOptions);
  });

  it('refuses to encode values that would not read back the same', () => {
    expect(() => encodePayload(withStep({ value: -1n }))).toThrow(badOptions);
    expect(() => encodePayload(withStep({ value: 2n ** 256n }))).toThrow(badOptions);
    expect(() => encodePayload(withStep({ data: '0xabc' }))).toThrow(badOptions);
    expect(() => encodePayload(withStep({ data: 'not hex' as never }))).toThrow(badOptions);
    expect(() => encodePayload({ ...one, chainId: 1.5 })).toThrow(badOptions);
    expect(() => encodePayload({ ...one, chainId: 0 })).toThrow(badOptions);
    expect(() => encodePayload({ ...one, from: '0x1234' })).toThrow(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
    expect(() => encodePayload(withStep({ to: 'nope' as never }))).toThrow(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
  });
});

describe('handoff formats', () => {
  it('builds and parses #/sign links on any base', () => {
    const link = signLink(one, 'https://atropyle.okx');
    expect(link).toMatch(/^https:\/\/atropyle\.okx\/#\/sign\?p=[A-Za-z0-9_-]+$/);
    expect(parseSignLink(link)).toEqual(one);
    expect(signLink(one, 'https://duongnq2798.github.io/atropyle/')).toMatch(
      /^https:\/\/duongnq2798\.github\.io\/atropyle\/#\/sign\?p=/,
    );
    expect(signLink(one, 'https://x.test/#/home')).toMatch(/^https:\/\/x\.test\/#\/sign\?p=/);
    expect(() => parseSignLink('https://x.test/#/v/0xabc')).toThrow(invalid);
  });

  it('reads a link with other parameters, and refuses one with two p parameters', () => {
    const p = encodePayload(one);
    expect(parseSignLink(`https://x.test/#/sign?a=1&p=${p}&b=2`)).toEqual(one);
    expect(() => parseSignLink(`https://x.test/#/sign?p=${p}&p=${p}`)).toThrow(invalid);
    expect(() => parseSignLink(`https://x.test/#/sign?p=${p}&a=1&p=${encodePayload({ ...one, from: B })}`)).toThrow(
      invalid,
    );
    expect(() => parseSignLink('https://x.test/#/sign?p=')).toThrow(invalid);
  });

  it('only builds links on an http(s) base', () => {
    expect(signLink(one, 'http://localhost:5173')).toMatch(/^http:\/\/localhost:5173\/#\/sign\?p=/);
    for (const base of ['javascript:alert(1)//', 'atropyle.okx', '', 'ftp://x.test']) {
      expect(() => signLink(one, base)).toThrow(badOptions);
    }
  });

  it('prints a cast command without any signer', () => {
    const tx = { chainId: 196, from: A, to: B, data: '0x183ff085', value: 0n } as const;
    expect(castCommand(tx, 'https://rpc.xlayer.tech')).toBe(
      `cast send ${B} 0x183ff085 --from ${A} --chain 196 --rpc-url https://rpc.xlayer.tech`,
    );
    expect(castCommand({ ...tx, value: 5n }, 'https://rpc.xlayer.tech')).toMatch(/ --value 5$/);
    expect(() => castCommand(tx, 'https://x.test; rm -rf ~')).toThrow(badOptions);
  });

  it('builds EIP-5792 wallet_sendCalls parameters', () => {
    expect(sendCallsParams(one)).toEqual({
      version: '2.0.0',
      chainId: '0xc4',
      from: A,
      atomicRequired: false,
      calls: [{ to: B, data: '0x183ff085', value: '0x0' }],
    });
  });

  it('builds the OKX Agentic Wallet command', () => {
    const tx = { chainId: 196, from: A, to: B, data: '0x183ff085', value: 0n } as const;
    expect(okxCommand(tx)).toBe(`onchainos wallet contract-call --chain 196 --to ${B} --input-data 0x183ff085`);
    expect(() => okxCommand({ ...tx, value: 1n })).toThrow(badOptions);
  });

  it('puts nothing but addresses, hex and numbers on a shell line', () => {
    const tx = { chainId: 196, from: A, to: B, data: '0x183ff085', value: 0n } as const;
    const hostile = [
      { ...tx, data: '0x01; rm -rf ~' },
      { ...tx, to: `${B} && echo` },
      { ...tx, from: '$(whoami)' },
      { ...tx, chainId: Number.NaN },
      { ...tx, value: '5; rm' },
    ] as unknown as (typeof tx)[];
    for (const t of hostile) {
      expect(() => castCommand(t, 'https://rpc.xlayer.tech')).toThrow(badOptions);
      expect(() => okxCommand(t)).toThrow(badOptions);
    }
  });
});
