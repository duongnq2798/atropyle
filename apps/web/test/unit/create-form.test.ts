import { type PlanIssue, validatePlan } from '@atropyle/sdk';
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  type CreateForm,
  circuitShortcut,
  customFrom,
  exactDuration,
  firstStepWithIssue,
  formToPlan,
  initialForm,
  issuesUpTo,
  presetsFor,
  removeHeir,
  stepOfIssue,
  tokenChoices,
  XLAYER_TOKENS,
} from '../../src/lib/create-form';
import { fixtureDeployment } from './fixtures';

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const HEIR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const HEIR2 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const G = [
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
];
const TOKEN = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';

const check = (f: CreateForm) => validatePlan(formToPlan(f), { owner: OWNER, drill: f.drill });
const codes = (r: ReturnType<typeof check>) => (r.ok ? [] : r.issues.map((i) => [i.path, i.code]));

describe('create form', () => {
  it('a Drill form with one heir becomes a simple Drill plan', () => {
    const f = initialForm(true);
    expect(f.template).toBe('simple');
    expect(f.timing.preset).toBe('drill');
    const r = check({
      ...f,
      heirs: [{ account: HEIR, percent: '50' }],
      assets: [{ kind: 'erc20', token: TOKEN, id: '', heir: '0' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({
      drill: true,
      k: 0,
      guardians: [],
      recoveryEnabled: false,
      heirs: [{ account: HEIR, bps: 10000 }],
      timing: { period: 60, threshold: 2, window: 120 },
      assets: [{ kind: 'erc20', token: TOKEN, id: 0n, heir: 0 }],
    });
  });

  it('percent shares become bps; a missing share points at its field', () => {
    const f = {
      ...initialForm(true),
      heirs: [
        { account: HEIR, percent: '60' },
        { account: HEIR2, percent: '40' },
      ],
    };
    const r = check(f);
    expect(r.ok && r.config.heirs.map((h) => h.bps)).toEqual([6000, 4000]);
    const bad = check({
      ...f,
      heirs: [
        { account: HEIR, percent: '60' },
        { account: HEIR2, percent: '' },
      ],
    });
    expect(codes(bad)).toEqual([['heirs[1].percent', 'TYPE']]);
  });

  it('a guarded form defaults k to a majority and flags bad guardians', () => {
    const base = { ...initialForm(false), heirs: [{ account: HEIR, percent: '' }] };
    expect(base.template).toBe('guarded');
    const ok = check({ ...base, guardians: G });
    expect(ok.ok && ok.config).toMatchObject({ k: 2, recoveryEnabled: false, guardians: G });
    const ticked = check({ ...base, guardians: G, recoveryEnabled: true });
    expect(ticked.ok && ticked.config).toMatchObject({ k: 2, recoveryEnabled: true, guardians: G });
    expect(codes(check(base))).toEqual([['guardians[0]', 'INVALID_ADDRESS']]);
    expect(codes(check({ ...base, guardians: G, k: '4' }))).toEqual([['k', 'K_RANGE']]);
    expect(codes(check({ ...base, guardians: [OWNER] }))).toEqual([['guardians[0]', 'GUARDIAN_IS_OWNER']]);
  });

  it('recovery is opt-in and always passed to the SDK explicitly', () => {
    expect(initialForm(true).recoveryEnabled).toBe(false);
    expect(initialForm(false).recoveryEnabled).toBe(false);
    const g = { ...initialForm(false), guardians: G };
    expect(formToPlan(g)).toHaveProperty('recoveryEnabled', false);
    expect(formToPlan({ ...g, recoveryEnabled: true })).toHaveProperty('recoveryEnabled', true);
  });

  it('maps issue paths to wizard steps', () => {
    expect(stepOfIssue('heirs')).toBe('people');
    expect(stepOfIssue('heirs[2].account')).toBe('people');
    expect(stepOfIssue('guardians[0]')).toBe('people');
    expect(stepOfIssue('k')).toBe('people');
    expect(stepOfIssue('recoveryEnabled')).toBe('people');
    expect(stepOfIssue('timing.period')).toBe('timing');
    expect(stepOfIssue('assets[0].token')).toBe('assets');
    expect(stepOfIssue('')).toBe('assets');
    const issues: PlanIssue[] = [
      { path: 'assets[0].id', code: 'TYPE', message: 'assets[0].id: expected a token id (whole number)' },
      { path: 'timing.window', code: 'WINDOW_MIN', message: 'timing.window: must be at least 3d (got 1d)' },
    ];
    expect(issuesUpTo('people', issues)).toEqual([]);
    expect(issuesUpTo('timing', issues).map((i) => i.path)).toEqual(['timing.window']);
    expect(issuesUpTo('assets', issues)).toHaveLength(2);
    expect(firstStepWithIssue(issues)).toBe('timing');
    expect(firstStepWithIssue([])).toBeNull();
  });

  it('custom timing starts from the preset and keeps the minimums', () => {
    expect(exactDuration(2_592_000)).toBe('30d');
    expect(exactDuration(1_209_600)).toBe('2w');
    expect(exactDuration(120)).toBe('2m');
    expect(exactDuration(90)).toBe('90s');
    expect(customFrom('sixMonths')).toEqual({ preset: 'custom', period: '30d', threshold: '6', window: '2w' });
    expect(customFrom('drill')).toEqual({ preset: 'custom', period: '1m', threshold: '2', window: '2m' });
    expect(presetsFor(true)).toEqual(['drill']);
    expect(presetsFor(false)).toEqual(['sixMonths', 'twelveMonths']);
    const base = { ...initialForm(false), template: 'simple' as const, heirs: [{ account: HEIR, percent: '' }] };
    const ok = check({ ...base, timing: { preset: 'custom', period: '1d', threshold: '3', window: '3d' } });
    expect(ok.ok && ok.config.timing).toEqual({ period: 86400, threshold: 3, window: 259200 });
    expect(codes(check({ ...base, timing: { preset: 'custom', period: '1d', threshold: '', window: '3d' } }))).toEqual([
      ['timing.threshold', 'THRESHOLD_RANGE'],
    ]);
    expect(codes(check({ ...base, timing: { preset: 'custom', period: '1h', threshold: '3', window: '3d' } }))).toEqual(
      [['timing.period', 'PERIOD_MIN']],
    );
  });

  it('NFT rows keep id and heir; ERC-20 rows drop them', () => {
    const d = fixtureDeployment();
    const f: CreateForm = {
      ...initialForm(true),
      heirs: [
        { account: HEIR, percent: '50' },
        { account: HEIR2, percent: '50' },
      ],
      assets: [
        { kind: 'erc20', token: TOKEN, id: '7', heir: '1' },
        { ...circuitShortcut(d), id: '4', heir: '1' },
      ],
    };
    expect(formToPlan(f).assets).toEqual([
      { kind: 'erc20', token: TOKEN },
      { kind: 'erc721', token: d.cpu, id: '4', heir: 1 },
    ]);
    expect(codes(check({ ...f, assets: [circuitShortcut(d)] }))).toEqual([['assets[0].id', 'TYPE']]);
  });

  it('removing an heir moves NFT assignments with it', () => {
    const f: CreateForm = {
      ...initialForm(true),
      heirs: [
        { account: HEIR, percent: '50' },
        { account: HEIR2, percent: '30' },
        { account: G[0], percent: '20' },
      ],
      assets: [
        { kind: 'erc721', token: TOKEN, id: '1', heir: '2' },
        { kind: 'erc721', token: TOKEN, id: '2', heir: '1' },
        { kind: 'erc20', token: TOKEN, id: '', heir: '0' },
      ],
    };
    const g = removeHeir(f, 1);
    expect(g.heirs.map((h) => h.account)).toEqual([HEIR, G[0]]);
    expect(g.assets.map((a) => a.heir)).toEqual(['1', '0', '0']);
    const one = initialForm(true);
    expect(removeHeir(one, 0)).toBe(one);
  });

  it('offers the X Layer tokens on chain 196 and the fee tokens elsewhere', () => {
    expect(XLAYER_TOKENS.map((t) => t.symbol)).toEqual(['USDT0', 'USDC', 'USDG', 'WOKB', 'BEM']);
    for (const t of XLAYER_TOKENS) expect(getAddress(t.address)).toBe(t.address);
    expect(tokenChoices(fixtureDeployment())).toEqual(XLAYER_TOKENS);
    const local = fixtureDeployment({ chainId: 31337, feeTokens: ['0x5FbDB2315678afecb367f032d93F642f64180aa3'] });
    expect(tokenChoices(local)).toEqual([{ symbol: null, address: '0x5FbDB2315678afecb367f032d93F642f64180aa3' }]);
    expect(circuitShortcut(local)).toEqual({ kind: 'erc721', token: local.cpu, id: '', heir: '0' });
  });
});
