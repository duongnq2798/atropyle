// @vitest-environment node
import { parseSignLink, type SignPayload, signLink } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  createHref,
  isCurrent,
  joinHref,
  LIMITS_HREF,
  legacyTarget,
  NAV,
  ROUTES,
  signHref,
  toSdkSignLink,
  vaultHref,
  verifyHref,
} from '../../src/routes';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('routes', () => {
  it('puts every parameter after the #, so it never reaches a server', () => {
    expect(createHref()).toBe('/create/#drill');
    expect(createHref('real')).toBe('/create/#real');
    expect(vaultHref(A)).toBe(`/vault/#${A}`);
    expect(verifyHref(A)).toBe(`/verify/#${A}`);
    expect(joinHref(A, 'heir')).toBe(`/join/#${A}.heir`);
    expect(signHref('AQID')).toBe('/sign/#p=AQID');
    expect(LIMITS_HREF).toBe('/proof/#limits');
    for (const path of Object.values(ROUTES)) expect(path.endsWith('/'), path).toBe(true);
  });

  it('marks the current page whatever the trailing slash', () => {
    expect(isCurrent('/create/', ROUTES.create)).toBe(true);
    expect(isCurrent('/create', ROUTES.create)).toBe(true);
    expect(isCurrent('/create/', createHref('real'))).toBe(true);
    expect(isCurrent('/', ROUTES.home)).toBe(true);
    expect(isCurrent('/proof/', ROUTES.create)).toBe(false);
    expect(isCurrent('/', ROUTES.create)).toBe(false);
  });

  it('navigates only to known routes', () => {
    const known = new Set<string>(Object.keys(ROUTES));
    for (const item of NAV) expect(known.has(item.route), item.route).toBe(true);
  });

  it('an SDK sign link survives the redirect and decodes to the same request', () => {
    const payload: SignPayload = {
      chainId: 196,
      from: A,
      steps: [{ to: B, data: `0x5c19a95c${'00'.repeat(32)}`, value: 1n }],
    };
    const old = new URL(signLink(payload, 'https://atropyle.example/'));
    const moved = new URL(legacyTarget(old.pathname, old.hash) ?? '', old);
    expect(moved.pathname).toBe('/sign/');
    expect(toSdkSignLink(moved.hash)).toBe(old.hash);
    expect(parseSignLink(toSdkSignLink(moved.hash))).toEqual(payload);
  });

  it('keeps two p parameters, so the SDK refuses the link', () => {
    expect(toSdkSignLink('#p=a&p=b')).toBe('#/sign?p=a&p=b');
    expect(() => parseSignLink(toSdkSignLink('#p=a&p=b'))).toThrow(/more than one p/);
    expect(toSdkSignLink('')).toBe('#/sign?');
  });
});
