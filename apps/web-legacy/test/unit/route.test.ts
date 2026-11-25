import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from '../../src/lib/route';

const LOWER = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const CHECKSUM = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('parseRoute', () => {
  it.each(['', '#', '#/', '/'])('%j is the home page', (h) => {
    expect(parseRoute(h)).toEqual({ name: 'home' });
  });

  it('reads the create page and its drill flag', () => {
    expect(parseRoute('#/create')).toEqual({ name: 'create', drill: false });
    expect(parseRoute('#/create?drill=1')).toEqual({ name: 'create', drill: true });
  });

  it('checksums vault addresses', () => {
    expect(parseRoute(`#/v/${LOWER}`)).toEqual({ name: 'vault', vault: CHECKSUM });
    expect(parseRoute(`#/v/${LOWER}/verify`)).toEqual({ name: 'verify', vault: CHECKSUM });
  });

  it('reads the fixed pages, ignoring the query of #/sign', () => {
    expect(parseRoute('#/proof')).toEqual({ name: 'proof' });
    expect(parseRoute('#/sign?p=AQID')).toEqual({ name: 'sign' });
    expect(parseRoute('#/status')).toEqual({ name: 'status' });
    expect(parseRoute('#/developers')).toEqual({ name: 'developers' });
  });

  it('reports a bad vault address instead of throwing', () => {
    expect(parseRoute('#/v/0x1234')).toEqual({ name: 'badAddress', input: '0x1234' });
    expect(parseRoute('#/v/%E0%A4%A')).toEqual({ name: 'badAddress', input: '%E0%A4%A' });
  });

  it('reports unknown paths', () => {
    expect(parseRoute('#/nope/x')).toEqual({ name: 'notFound', path: '/nope/x' });
    expect(parseRoute(`#/v/${LOWER}/x`)).toEqual({ name: 'notFound', path: `/v/${LOWER}/x` });
  });
});

describe('href', () => {
  it('round-trips every route that has a link', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'create', drill: false },
      { name: 'create', drill: true },
      { name: 'vault', vault: CHECKSUM },
      { name: 'verify', vault: CHECKSUM },
      { name: 'proof' },
      { name: 'status' },
      { name: 'developers' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});
