import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  PRESETS,
  planTemplate,
  resolveTiming,
  sharesToBps,
  validatePlan,
  validateSection,
} from '../../src/plan/index';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const C = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const D = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const E = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const F = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const VAULT = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const ZERO = `0x${'0'.repeat(40)}`;

const base = {
  heirs: [
    { account: A, bps: 6000 },
    { account: B, bps: 4000 },
  ],
  guardians: [C, D, E],
  k: 2,
  recoveryEnabled: true,
  timing: 'sixMonths',
  assets: [
    { kind: 'erc20', token: TOKEN },
    { kind: 'erc721', token: TOKEN, id: '1', heir: 1 },
  ],
};

const codes = (
  input: unknown,
  ctx: { owner?: string; drill?: boolean; vault?: string } = { owner: OWNER, vault: VAULT },
) => {
  const r = validatePlan(input, ctx);
  return r.ok ? [] : r.issues.map((i) => `${i.path}:${i.code}`);
};

describe('validatePlan', () => {
  it('accepts a guarded plan and normalizes it', () => {
    const r = validatePlan(
      { ...base, heirs: [{ account: A.toLowerCase(), bps: 6000 }, base.heirs[1]] },
      { owner: OWNER },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.heirs[0].account).toBe(A);
    expect(r.config.timing).toEqual(PRESETS.sixMonths);
    expect(r.config.assets).toEqual([
      { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 },
      { kind: 'erc721', token: TOKEN, id: 1n, heir: 1 },
    ]);
    expect(r.config.owner).toBe(OWNER);
    expect(r.config.drill).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it.each([
    ['no heirs', { ...base, heirs: [] }, ['heirs:HEIRS_COUNT']],
    [
      'six heirs',
      { ...base, heirs: [A, B, C, D, E, F].map((account) => ({ account, bps: 1000 })), assets: [] },
      ['heirs:HEIRS_COUNT'],
    ],
    [
      'owner as heir',
      { ...base, heirs: [{ account: OWNER, bps: 10000 }], assets: [] },
      ['heirs[0].account:HEIR_IS_OWNER'],
    ],
    [
      'vault as heir',
      { ...base, heirs: [{ account: VAULT, bps: 10000 }], assets: [] },
      ['heirs[0].account:HEIR_IS_VAULT'],
    ],
    ['zero heir', { ...base, heirs: [{ account: ZERO, bps: 10000 }], assets: [] }, ['heirs[0].account:ZERO_ADDRESS']],
    [
      'duplicate heir',
      {
        ...base,
        heirs: [
          { account: A, bps: 5000 },
          { account: A, bps: 5000 },
        ],
      },
      ['heirs[1].account:DUPLICATE'],
    ],
    [
      'bps zero',
      {
        ...base,
        heirs: [
          { account: A, bps: 0 },
          { account: B, bps: 10000 },
        ],
      },
      ['heirs[0].bps:SHARE_ZERO'],
    ],
    [
      'bps sum',
      {
        ...base,
        heirs: [
          { account: A, bps: 6000 },
          { account: B, bps: 3000 },
        ],
      },
      ['heirs:SHARES_SUM'],
    ],
    [
      'mixed shares',
      {
        ...base,
        heirs: [
          { account: A, bps: 6000 },
          { account: B, percent: 40 },
        ],
      },
      ['heirs:SHARE_FORMAT'],
    ],
    ['six guardians', { ...base, guardians: [A, B, C, D, E, F] }, ['guardians:GUARDIANS_COUNT']],
    ['owner as guardian', { ...base, guardians: [OWNER, C] }, ['guardians[0]:GUARDIAN_IS_OWNER']],
    ['vault as guardian', { ...base, guardians: [VAULT, C] }, ['guardians[0]:GUARDIAN_IS_VAULT']],
    ['duplicate guardian', { ...base, guardians: [C, C] }, ['guardians[1]:DUPLICATE']],
    ['k above n', { ...base, k: 4 }, ['k:K_RANGE']],
    ['recovery with k 0', { ...base, k: 0 }, ['recoveryEnabled:RECOVERY_NEEDS_K']],
    ['missing k', { ...base, k: undefined }, ['k:REQUIRED']],
    ['unknown preset', { ...base, timing: 'forever' }, ['timing:UNKNOWN_PRESET']],
    [
      'drill preset on a real vault',
      { ...base, timing: 'drill' },
      ['timing.period:PERIOD_MIN', 'timing.window:WINDOW_MIN'],
    ],
    [
      'threshold 0',
      { ...base, timing: { period: '30d', threshold: 0, window: '14d' } },
      ['timing.threshold:THRESHOLD_RANGE'],
    ],
    [
      'threshold 16',
      { ...base, timing: { period: '30d', threshold: 16, window: '14d' } },
      ['timing.threshold:THRESHOLD_RANGE'],
    ],
    [
      'period above uint32',
      { ...base, timing: { period: 4294967296, threshold: 3, window: '14d' } },
      ['timing.period:DURATION_MAX'],
    ],
    ['bad duration', { ...base, timing: { period: '30 days', threshold: 3, window: '14d' } }, ['timing.period:TYPE']],
    ['erc20 with id', { ...base, assets: [{ kind: 'erc20', token: TOKEN, id: 5 }] }, ['assets[0].id:ERC20_ID_NONZERO']],
    [
      'asset heir out of range',
      { ...base, assets: [{ kind: 'erc721', token: TOKEN, id: 1, heir: 2 }] },
      ['assets[0].heir:ASSET_HEIR_RANGE'],
    ],
    [
      'duplicate asset',
      {
        ...base,
        assets: [
          { kind: 'erc721', token: TOKEN, id: 1 },
          { kind: 'erc1155', token: TOKEN, id: 1 },
        ],
      },
      ['assets[1]:DUPLICATE'],
    ],
    ['bad kind', { ...base, assets: [{ kind: 'erc777', token: TOKEN }] }, ['assets[0].kind:ASSET_KIND']],
    [
      '21 assets',
      { ...base, assets: Array.from({ length: 21 }, (_, i) => ({ kind: 'erc721', token: TOKEN, id: i })) },
      ['assets:ASSETS_COUNT'],
    ],
    ['typo field', { ...base, heir: [] }, ['heir:UNKNOWN_FIELD']],
    ['bad address', { ...base, guardians: ['0x1234', C] }, ['guardians[0]:INVALID_ADDRESS']],
  ])('%s', (_name, input, expected) => {
    expect(codes(input)).toEqual(expected);
  });

  // Case-by-case parity with contracts/test/VaultConfig.t.sol that the rows above do not cover.
  it.each([
    ['zero guardian', { ...base, guardians: [ZERO, C] }, ['guardians[0]:ZERO_ADDRESS']],
    ['zero asset token', { ...base, assets: [{ kind: 'erc20', token: ZERO }] }, ['assets[0].token:ZERO_ADDRESS']],
    ['k above zero without guardians', { ...base, guardians: [], k: 1, recoveryEnabled: false }, ['k:K_RANGE']],
    ['recovery without guardians or k', { ...base, guardians: [], k: undefined }, ['recoveryEnabled:RECOVERY_NEEDS_K']],
    [
      'recovery with an explicit k 0 and no guardians',
      { ...base, guardians: [], k: 0 },
      ['recoveryEnabled:RECOVERY_NEEDS_K'],
    ],
    ['bps above 10000', { ...base, heirs: [{ account: A, bps: 10001 }], assets: [] }, ['heirs[0].bps:SHARE_ZERO']],
    ['fractional bps', { ...base, heirs: [{ account: A, bps: 10000.5 }], assets: [] }, ['heirs[0].bps:SHARE_ZERO']],
    [
      'two heirs without shares',
      { ...base, heirs: [{ account: A }, { account: B }], assets: [] },
      ['heirs:SHARES_SUM'],
    ],
    [
      'period one second under a day',
      { ...base, timing: { period: 86399, threshold: 3, window: '3d' } },
      ['timing.period:PERIOD_MIN'],
    ],
    [
      'window one second under three days',
      { ...base, timing: { period: '1d', threshold: 3, window: 259199 } },
      ['timing.window:WINDOW_MIN'],
    ],
    [
      'window above uint32',
      { ...base, timing: { period: '1d', threshold: 3, window: 4294967296 } },
      ['timing.window:DURATION_MAX'],
    ],
    [
      'asset with no heirs to point at',
      { ...base, heirs: [], assets: [{ kind: 'erc20', token: TOKEN }] },
      ['heirs:HEIRS_COUNT'],
    ],
    [
      'erc20 id given as 0x1',
      { ...base, assets: [{ kind: 'erc20', token: TOKEN, id: '0x1' }] },
      ['assets[0].id:ERC20_ID_NONZERO'],
    ],
    ['negative token id', { ...base, assets: [{ kind: 'erc721', token: TOKEN, id: -1 }] }, ['assets[0].id:TYPE']],
    [
      'token id above uint256',
      { ...base, assets: [{ kind: 'erc721', token: TOKEN, id: (2n ** 256n).toString() }] },
      ['assets[0].id:TYPE'],
    ],
    [
      'unknown field in an heir',
      { ...base, heirs: [{ account: A, bps: 10000, share: 1 }], assets: [] },
      ['heirs[0].share:UNKNOWN_FIELD'],
    ],
    ['version 2', { ...base, version: 2 }, ['version:TYPE']],
    ['non-boolean drill', { ...base, drill: 'yes' }, ['drill:TYPE']],
    ['no timing', { ...base, timing: undefined }, ['timing:REQUIRED']],
  ])('matches the contract: %s', (_name, input, expected) => {
    expect(codes(input)).toEqual(expected);
  });

  it.each([
    ['five heirs', { ...base, heirs: [A, B, C, D, E].map((account) => ({ account, bps: 2000 })), assets: [] }],
    ['five guardians that are also heirs', { ...base, guardians: [A, B, C, D, E], k: 5 }],
    ['guardians with k 0 and no recovery', { ...base, k: 0, recoveryEnabled: false }],
    [
      'twenty assets',
      { ...base, assets: Array.from({ length: 20 }, (_, i) => ({ kind: 'erc721', token: TOKEN, id: i })) },
    ],
    [
      'two ids of one collection',
      {
        ...base,
        assets: [
          { kind: 'erc721', token: TOKEN, id: 1, heir: 0 },
          { kind: 'erc721', token: TOKEN, id: 2, heir: 1 },
        ],
      },
    ],
    ['the exact minimums', { ...base, timing: { period: '1d', threshold: 1, window: '3d' } }],
    ['the maximum threshold', { ...base, timing: { period: '1d', threshold: 15, window: '3d' } }],
    ['the largest uint32 durations', { ...base, timing: { period: 4294967295, threshold: 15, window: 4294967295 } }],
    [
      'the largest token id',
      { ...base, assets: [{ kind: 'erc1155', token: TOKEN, id: (2n ** 256n - 1n).toString() }] },
    ],
  ])('accepts what the contract accepts: %s', (_name, input) => {
    expect(codes(input)).toEqual([]);
  });

  it('rejects inherited names as presets', () => {
    for (const name of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
      expect(codes({ ...base, timing: name })).toEqual(['timing:UNKNOWN_PRESET']);
    }
    expect(() => resolveTiming('constructor' as never, false)).toThrow(
      expect.objectContaining({ code: 'PLAN_INVALID' }),
    );
  });

  it('never echoes hidden or oversized text from the input into issue messages', () => {
    const r = validatePlan(
      { ...base, timing: `a\u{202E}b${'x'.repeat(500)}`, 'k\u{200B}\u{202E}ey': 1 },
      { owner: OWNER },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.issues.map((i) => `${i.path} ${i.message}`).join('\n');
    expect(text).not.toMatch(/[\u{200B}\u{202E}]/u);
    expect(text.length).toBeLessThan(500);
  });

  it('collects every issue at once', () => {
    expect(codes({ heirs: [{ account: OWNER, bps: 1 }], k: 9, timing: 'nope' })).toEqual([
      'heirs[0].account:HEIR_IS_OWNER',
      'heirs:SHARES_SUM',
      'k:K_RANGE',
      'timing:UNKNOWN_PRESET',
    ]);
  });

  it('allows the Drill minimums only on a Drill', () => {
    const drill = { ...base, timing: { period: 60, threshold: 2, window: '1m' } };
    expect(validatePlan(drill, { owner: OWNER, drill: true }).ok).toBe(true);
    expect(
      codes({ ...drill, timing: { period: 59, threshold: 2, window: 60 } }, { owner: OWNER, drill: true }),
    ).toEqual(['timing.period:PERIOD_MIN']);
    expect(
      codes({ ...drill, timing: { period: 60, threshold: 2, window: 59 } }, { owner: OWNER, drill: true }),
    ).toEqual(['timing.window:WINDOW_MIN']);
  });

  it('warns that a Drill is for practice and that no guardian means automatic release', () => {
    const r = validatePlan({ heirs: [{ account: A }], timing: 'drill', drill: true }, { owner: OWNER });
    expect(r.ok && r.warnings.map((w) => w.code)).toEqual(['NO_GUARDIANS', 'DRILL_NOT_FOR_REAL_ASSETS']);
  });

  it('validates the owner of the file when ctx gives none', () => {
    expect(codes({ ...base, owner: ZERO }, {})).toEqual(['owner:ZERO_ADDRESS']);
    expect(codes({ ...base, owner: '0x1234' }, {})).toEqual(['owner:INVALID_ADDRESS']);
    expect(codes({ ...base, owner: A }, {})).toEqual(['heirs[0].account:HEIR_IS_OWNER']);
  });

  it('lets ctx override the owner and drill of the file', () => {
    const r = validatePlan({ ...base, owner: B, drill: true }, { owner: OWNER, drill: false });
    expect(r.ok && [r.config.owner, r.config.drill]).toEqual([OWNER, false]);
  });

  it('treats one heir without a share as 100%', () => {
    const r = validatePlan({ heirs: [{ account: A }], timing: 'twelveMonths' }, { owner: OWNER });
    expect(r.ok && r.config.heirs).toEqual([{ account: A, bps: 10000 }]);
    expect(r.ok && r.warnings.map((w) => w.code)).toEqual(['NO_GUARDIANS']);
  });

  it('works without an owner and skips owner checks', () => {
    expect(validatePlan(base).ok).toBe(true);
  });

  it('skips the vault-address checks when the vault is not known yet', () => {
    expect(codes({ ...base, heirs: [{ account: VAULT, bps: 10000 }], assets: [] }, { owner: OWNER })).toEqual([]);
  });

  it('rejects non-objects', () => {
    expect(codes('hello')).toEqual([':TYPE']);
    expect(codes(null)).toEqual([':TYPE']);
    expect(codes([])).toEqual([':TYPE']);
  });

  it('keeps the limits and presets as specified', () => {
    expect(LIMITS).toEqual({
      maxHeirs: 5,
      maxGuardians: 5,
      maxAssets: 20,
      bps: 10000,
      minPeriod: 86400,
      minWindow: 259200,
      drillMin: 60,
      maxThreshold: 15,
      maxUint32: 4294967295,
    });
    expect(PRESETS).toEqual({
      drill: { period: 60, threshold: 2, window: 120 },
      sixMonths: { period: 2592000, threshold: 6, window: 1209600 },
      twelveMonths: { period: 2592000, threshold: 12, window: 2592000 },
    });
  });
});

describe('sharesToBps', () => {
  it('sharesToBps keeps the sum at 10000', () => {
    expect(sharesToBps([70, 30])).toEqual([7000, 3000]);
    expect(sharesToBps([100 / 3, 100 / 3, 100 / 3])).toEqual([3334, 3333, 3333]);
    expect(sharesToBps([33.34, 33.34, 33.33])).toEqual([3333, 3334, 3333]);
    expect(sharesToBps([0.29, 99.71])).toEqual([29, 9971]);
    for (const shares of [
      [50, 30, 20],
      [12.5, 12.5, 75],
      [1, 1, 98],
      [20.01, 19.99, 60],
    ]) {
      expect(sharesToBps(shares).reduce((a, b) => a + b, 0)).toBe(10000);
    }
    expect(() => sharesToBps([50, 60])).toThrow(expect.objectContaining({ code: 'PLAN_INVALID' }));
    expect(() => sharesToBps([100, 0])).toThrow(expect.objectContaining({ code: 'PLAN_INVALID' }));
  });

  it('gives the remainder to the first heir and leaves the others rounded down', () => {
    expect(sharesToBps([25, 25, 25, 25])).toEqual([2500, 2500, 2500, 2500]);
    expect(sharesToBps(Array.from({ length: 7 }, () => 100 / 7))).toEqual([1432, 1428, 1428, 1428, 1428, 1428, 1428]);
    expect(sharesToBps([100])).toEqual([10000]);
  });

  it('rejects a share too small to be one basis point', () => {
    expect(() => sharesToBps([0.001, 0.001, 99.998])).toThrow(expect.objectContaining({ code: 'PLAN_INVALID' }));
    expect(() => sharesToBps([])).toThrow(expect.objectContaining({ code: 'PLAN_INVALID' }));
    expect(() => sharesToBps([Number.NaN, 100])).toThrow(expect.objectContaining({ code: 'PLAN_INVALID' }));
  });

  it('converts percent heirs inside a plan', () => {
    const r = validatePlan(
      {
        ...base,
        heirs: [
          { account: A, percent: 100 / 3 },
          { account: B, percent: 100 / 3 },
          { account: C, percent: 100 / 3 },
        ],
        guardians: [D, E],
        assets: [],
      },
      { owner: OWNER },
    );
    expect(r.ok && r.config.heirs.map((h) => h.bps)).toEqual([3334, 3333, 3333]);
  });

  it('reports percent shares that do not add up as SHARES_SUM', () => {
    expect(
      codes({
        ...base,
        heirs: [
          { account: A, percent: 50 },
          { account: B, percent: 60 },
        ],
        assets: [],
      }),
    ).toEqual(['heirs:SHARES_SUM']);
  });
});

describe('templates and sections', () => {
  it('simple needs no guardians; guarded uses a majority', () => {
    const s = planTemplate('simple', { heirs: [{ account: A }] });
    expect(validatePlan(s, { owner: OWNER }).ok).toBe(true);
    expect(s.timing).toBe('twelveMonths');
    const g = planTemplate('guarded', { heirs: [{ account: A }], guardians: [C, D, E] });
    expect(g.k).toBe(2);
    expect(g.recoveryEnabled).toBe(true);
    const r = validatePlan(g, { owner: OWNER });
    expect(r.ok).toBe(true);
    const drill = planTemplate('simple', { heirs: [{ account: A }], drill: true });
    expect(validatePlan(drill, { owner: OWNER }).ok && drill.timing).toBe('drill');
  });

  it('resolveTiming throws PLAN_INVALID with issues', () => {
    expect(resolveTiming('drill', true)).toEqual({ period: 60, threshold: 2, window: 120 });
    expect(() => resolveTiming('drill', false)).toThrow(
      expect.objectContaining({ code: 'PLAN_INVALID', details: { issues: expect.any(Array) } }),
    );
  });

  it('validates one section against the current vault', () => {
    expect(validateSection('heirs', [{ account: A }], { owner: OWNER, heirCount: 0 })).toEqual({
      issues: [],
      value: [{ account: A, bps: 10000 }],
    });
    expect(validateSection('heirs', [{ account: VAULT }], { owner: OWNER, vault: VAULT, heirCount: 0 }).issues).toEqual(
      [expect.objectContaining({ path: 'heirs[0].account', code: 'HEIR_IS_VAULT' })],
    );
    expect(validateSection('guardians', [VAULT], { owner: OWNER, vault: VAULT, heirCount: 1, k: 1 }).issues).toEqual([
      expect.objectContaining({ path: 'guardians[0]', code: 'GUARDIAN_IS_VAULT' }),
    ]);
    const assets = validateSection('assets', [{ kind: 'erc721', token: TOKEN, id: 1, heir: 3 }], {
      owner: OWNER,
      heirCount: 2,
    });
    expect(assets.value).toBeNull();
    expect(assets.issues).toEqual([expect.objectContaining({ path: 'assets[0].heir', code: 'ASSET_HEIR_RANGE' })]);
    const g = validateSection('guardians', [C], { owner: OWNER, heirCount: 1, k: 2, recoveryEnabled: true });
    expect(g.issues).toEqual([expect.objectContaining({ path: 'k', code: 'K_RANGE' })]);
    expect(
      validateSection('guardians', [C.toLowerCase()], { owner: OWNER, heirCount: 1, k: 1, recoveryEnabled: true })
        .value,
    ).toEqual({
      guardians: [C],
      k: 1,
      recoveryEnabled: true,
    });
  });

  it('rejects the owner as an heir or a guardian in a section, and recovery without k', () => {
    expect(validateSection('heirs', [{ account: OWNER }], { owner: OWNER, heirCount: 0 }).issues).toEqual([
      expect.objectContaining({ path: 'heirs[0].account', code: 'HEIR_IS_OWNER' }),
    ]);
    expect(validateSection('guardians', [OWNER], { owner: OWNER, heirCount: 1, k: 1 }).issues).toEqual([
      expect.objectContaining({ path: 'guardians[0]', code: 'GUARDIAN_IS_OWNER' }),
    ]);
    expect(
      validateSection('guardians', [], { owner: OWNER, heirCount: 1, k: 0, recoveryEnabled: true }).issues,
    ).toEqual([expect.objectContaining({ path: 'recoveryEnabled', code: 'RECOVERY_NEEDS_K' })]);
    expect(validateSection('guardians', [], { owner: OWNER, heirCount: 1 })).toEqual({
      issues: [],
      value: { guardians: [], k: 0, recoveryEnabled: false },
    });
  });
});
