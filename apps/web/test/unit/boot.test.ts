// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { BOOT_SCRIPT, legacyTarget } from '../../src/theme/boot';
import { parseTheme, THEME_CHOICES } from '../../src/theme/theme';

/** 4 kB of every character base64url uses: the shape of a long signing payload. */
const PAYLOAD = Array.from({ length: 4096 }, (_, i) => 'ABYZabyz0189-_'[i % 14]).join('');

/** Runs the real inline script against a fake page; `theme` is the data-theme it left on <html>, or null. */
function page(o: { pathname?: string; hash?: string; stored?: string | null; storageThrows?: boolean } = {}) {
  const replace = vi.fn();
  const attrs = new Map<string, string>();
  const setAttribute = vi.fn((name: string, value: string) => {
    attrs.set(name, value);
  });
  const location = { pathname: o.pathname ?? '/', hash: o.hash ?? '', replace };
  const listeners = new Map<string, () => void>();
  const ctx: Record<string, unknown> = {
    location,
    document: { documentElement: { setAttribute } },
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
  };
  Object.defineProperty(ctx, 'localStorage', {
    get() {
      if (o.storageThrows) throw new Error('SecurityError: storage is disabled');
      return { getItem: (k: string) => (k === 'atropyle:theme' ? (o.stored ?? null) : null) };
    },
  });
  runInNewContext(BOOT_SCRIPT, ctx);
  /** The visitor changes only the fragment (a pasted link on an open page): no load, so only a listener sees it. */
  const changeHash = (hash: string) => {
    location.hash = hash;
    listeners.get('hashchange')?.();
  };
  return {
    replace,
    setAttribute,
    changeHash,
    theme: attrs.get('data-theme') ?? null,
    hash: attrs.get('data-hash') ?? null,
  };
}

describe('legacyTarget', () => {
  it('legacyTarget keeps the payload byte for byte', () => {
    expect(legacyTarget('/', `#/sign?p=${PAYLOAD}`)).toBe(`/sign/#p=${PAYLOAD}`);
    expect(legacyTarget('/index.html', `#/sign?p=${PAYLOAD}`)).toBe(`/sign/#p=${PAYLOAD}`);
    // Two p parameters move as they are, so the sign page still refuses the link.
    expect(legacyTarget('/', '#/sign?p=a&p=b')).toBe('/sign/#p=a&p=b');
  });

  it('maps every page of the old app', () => {
    const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const cases: [string, string][] = [
      [`#/v/${A}`, `/vault/#${A}`],
      [`#/v/${A}/`, `/vault/#${A}`],
      [`#/v/${A}/verify`, `/verify/#${A}`],
      ['#/proof', '/proof/'],
      ['#/status', '/status/'],
      ['#/developers', '/developers/'],
      ['#/create', '/create/'],
      ['#/create?drill=1', '/create/#drill'],
      ['#/sign', '/sign/'],
    ];
    for (const [hash, want] of cases) expect(legacyTarget('/', hash), hash).toBe(want);
  });

  it('legacyTarget leaves unknown hashes alone', () => {
    for (const hash of [
      '',
      '#',
      '#/',
      '#/nope',
      '#/v',
      '#/v/a/edit',
      '#/v/a/b/c',
      '#p=abc',
      '#drill',
      '#/sign/extra?p=a',
    ]) {
      expect(legacyTarget('/', hash), hash).toBeNull();
    }
    expect(legacyTarget('/vault/', '#/sign?p=a')).toBeNull();
    expect(legacyTarget('/sign/', '#/sign?p=a')).toBeNull();
  });
});

describe('boot script', () => {
  it('redirects a legacy link pasted on a page that is already open', () => {
    const p = page();
    expect(p.replace).not.toHaveBeenCalled();
    p.changeHash('#/proof');
    expect(p.replace).toHaveBeenCalledWith('/proof/');
    p.changeHash('#/v/0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC/verify');
    expect(p.replace).toHaveBeenLastCalledWith('/verify/#0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  });

  it('leaves in-page anchors and other pages alone when the fragment changes', () => {
    const home = page();
    home.changeHash('#main');
    home.changeHash('#/nope');
    expect(home.replace).not.toHaveBeenCalled();
    const vault = page({ pathname: '/vault/' });
    vault.changeHash('#/sign?p=a');
    expect(vault.replace).not.toHaveBeenCalled();
  });

  it('redirects a legacy link before it touches the theme', () => {
    const { replace, setAttribute } = page({ hash: '#/v/0xabc/verify', stored: 'light' });
    expect(replace).toHaveBeenCalledWith('/verify/#0xabc');
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it('always leaves a theme on <html>: a stored night or match device, else vellum', () => {
    expect(page({ stored: 'dark' }).theme).toBe('dark');
    expect(page({ stored: 'system' }).theme).toBe('system');
    for (const stored of ['light', 'blue', '', null, 'Dark', ' light']) {
      expect(page({ stored }).theme, String(stored)).toBe('light');
    }
  });

  it('leaves <html> as parseTheme reads the stored value', () => {
    // The inline script cannot import parseTheme; this keeps the two in step.
    for (const stored of [...THEME_CHOICES, 'blue', '', null, 'Dark', ' light']) {
      expect(parseTheme(page({ stored }).theme), String(stored)).toBe(parseTheme(stored));
    }
  });

  it('boot survives a localStorage that throws', () => {
    expect(() => page({ storageThrows: true })).not.toThrow();
    expect(page({ storageThrows: true }).theme).toBe('light');
    expect(page({ storageThrows: true, hash: '#/proof' }).replace).toHaveBeenCalledWith('/proof/');
  });
});

describe('the boot script marks what the fragment holds (7B-P1)', () => {
  const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

  it('marks an address on /vault/ and /verify/, a request on /sign/', () => {
    for (const pathname of ['/vault/', '/vault', '/vault/index.html', '/verify/']) {
      expect(page({ pathname, hash: `#${A}` }).hash, pathname).toBe('address');
    }
    expect(page({ pathname: '/sign/', hash: `#p=${PAYLOAD}` }).hash).toBe('request');
    expect(page({ pathname: '/sign/', hash: `#v=1&p=${PAYLOAD}` }).hash).toBe('request');
  });

  it('marks nothing for an empty or broken fragment, or on another page', () => {
    for (const [pathname, hash] of [
      ['/vault/', ''],
      ['/vault/', '#0x1234'],
      ['/vault/', `#${A}x`],
      ['/verify/', '#p=abc'],
      ['/sign/', ''],
      ['/sign/', `#${A}`],
      ['/', `#${A}`],
      ['/create/', `#${A}`],
    ]) {
      expect(page({ pathname, hash }).hash, `${pathname}${hash}`).toBeNull();
    }
  });

  it('still applies the theme beside the mark', () => {
    const p = page({ pathname: '/vault/', hash: `#${A}`, stored: 'light' });
    expect(p.theme).toBe('light');
    expect(p.hash).toBe('address');
  });
});
