import { describe, expect, it } from 'vitest';
import { levenshtein, suggestFor } from '../../src/lib/route-suggest';

const V = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('404 suggestions', () => {
  it('offer the vault for a path holding an address, and the nearest page for a typo', () => {
    expect(levenshtein('prof', 'proof')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(suggestFor(`/${V}`)).toEqual({ kind: 'vault', address: V });
    expect(suggestFor(`/vaults/${V}/`)).toEqual({ kind: 'vault', address: V });
    expect(suggestFor('/prof/')).toEqual({ kind: 'route', path: '/proof/' });
    expect(suggestFor('/Develpers')).toEqual({ kind: 'route', path: '/developers/' });
    expect(suggestFor('/statsu/')).toEqual({ kind: 'route', path: '/status/' });
    expect(suggestFor('/alerts/confrim/')).toEqual({ kind: 'route', path: '/alerts/confirm/' });
    expect(suggestFor('/privacy.html')).toEqual({ kind: 'route', path: '/privacy/' });
  });

  it('offer nothing when no page is close, and never a short page for a short guess', () => {
    expect(suggestFor('/')).toBeNull();
    expect(suggestFor('/a/')).toBeNull();
    expect(suggestFor('/mo/')).toBeNull();
    expect(suggestFor('/wp-admin/setup.php')).toBeNull();
    expect(suggestFor(`/${'x'.repeat(500)}`)).toBeNull();
    expect(suggestFor('/0x1234/')).toBeNull();
  });
});
