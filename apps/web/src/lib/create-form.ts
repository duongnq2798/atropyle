import {
  type AssetInput,
  type AssetKind,
  type Deployment,
  type HeirInput,
  type PlanInput,
  type PlanIssue,
  PRESETS,
  type PresetName,
  planTemplate,
  type TimingInput,
} from '@atropyle/sdk';
import type { Address } from 'viem';

export type Template = 'simple' | 'guarded';
export const STEPS = ['template', 'people', 'timing', 'assets'] as const;
export type StepId = (typeof STEPS)[number];

export interface HeirRow {
  account: string;
  percent: string;
}

export interface AssetRow {
  kind: AssetKind;
  token: string;
  id: string;
  heir: string;
}

export interface TimingForm {
  preset: PresetName | 'custom';
  period: string;
  threshold: string;
  window: string;
}

/** What the inputs hold, as typed. Only `formToPlan` turns it into a plan; the SDK decides what is valid. */
export interface CreateForm {
  drill: boolean;
  template: Template;
  heirs: HeirRow[];
  guardians: string[];
  k: string;
  recoveryEnabled: boolean;
  timing: TimingForm;
  assets: AssetRow[];
}

/** A Drill only makes sense with minute timings; a real vault never accepts them. */
export function presetsFor(drill: boolean): PresetName[] {
  return drill ? ['drill'] : ['sixMonths', 'twelveMonths'];
}

export function initialForm(drill: boolean): CreateForm {
  return {
    drill,
    template: drill ? 'simple' : 'guarded',
    heirs: [{ account: '', percent: '' }],
    guardians: [''],
    k: '',
    recoveryEnabled: false,
    timing: { preset: drill ? 'drill' : 'sixMonths', period: '', threshold: '', window: '' },
    assets: [],
  };
}

const UNITS = [
  ['w', 604_800],
  ['d', 86_400],
  ['h', 3_600],
  ['m', 60],
] as const;

/** A duration that `parseDuration` reads back exactly: the largest unit that divides it. */
export function exactDuration(seconds: number): string {
  for (const [unit, size] of UNITS) if (seconds > 0 && seconds % size === 0) return `${seconds / size}${unit}`;
  return `${seconds}s`;
}

export function customFrom(preset: PresetName): TimingForm {
  const p = PRESETS[preset];
  return {
    preset: 'custom',
    period: exactDuration(p.period),
    threshold: String(p.threshold),
    window: exactDuration(p.window),
  };
}

const optionalNumber = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s.trim()));

/** One heir needs no share (100%); with several, an empty share is left out so validatePlan names it. */
export function heirsInput(rows: readonly HeirRow[]): HeirInput[] {
  const single = rows.length === 1;
  return rows.map((h) => {
    const percent = single ? undefined : optionalNumber(h.percent);
    return percent === undefined ? { account: h.account.trim() } : { account: h.account.trim(), percent };
  });
}

export function assetsInput(rows: readonly AssetRow[]): AssetInput[] {
  return rows.map((a) =>
    a.kind === 'erc20'
      ? { kind: 'erc20', token: a.token.trim() }
      : { kind: a.kind, token: a.token.trim(), id: a.id.trim(), heir: optionalNumber(a.heir) ?? 0 },
  );
}

export function timingInput(t: TimingForm): TimingInput {
  if (t.preset !== 'custom') return t.preset;
  return { period: t.period.trim(), threshold: optionalNumber(t.threshold) ?? Number.NaN, window: t.window.trim() };
}

/** The wizard state as an `atropyle.plan.json` input. Empty fields stay empty so validatePlan names them. */
export function formToPlan(f: CreateForm): PlanInput {
  const heirs = heirsInput(f.heirs);
  const assets = assetsInput(f.assets);
  const timing = timingInput(f.timing);
  if (f.template === 'simple') return planTemplate('simple', { drill: f.drill, heirs, timing, assets });
  return planTemplate('guarded', {
    drill: f.drill,
    heirs,
    guardians: f.guardians.map((g) => g.trim()),
    k: optionalNumber(f.k),
    recoveryEnabled: f.recoveryEnabled,
    timing,
    assets,
  });
}

export function stepOfIssue(path: string): StepId {
  const head = path.split(/[.[]/)[0];
  if (head === 'heirs' || head === 'guardians' || head === 'k' || head === 'recoveryEnabled') return 'people';
  if (head === 'timing') return 'timing';
  return 'assets';
}

export function issuesFor(step: StepId, issues: readonly PlanIssue[]): PlanIssue[] {
  return issues.filter((i) => stepOfIssue(i.path) === step);
}

/** Issues that block leaving `step`: those of this step and of the steps before it. */
export function issuesUpTo(step: StepId, issues: readonly PlanIssue[]): PlanIssue[] {
  const last = STEPS.indexOf(step);
  return issues.filter((i) => STEPS.indexOf(stepOfIssue(i.path)) <= last);
}

export function firstStepWithIssue(issues: readonly PlanIssue[]): StepId | null {
  return STEPS.find((s) => issues.some((i) => stepOfIssue(i.path) === s)) ?? null;
}

/** NFTs follow their heir: later heirs shift down one; the removed heir's NFTs go back to heir 1. */
export function removeHeir(f: CreateForm, index: number): CreateForm {
  if (f.heirs.length <= 1 || index < 0 || index >= f.heirs.length) return f;
  const assets = f.assets.map((a) => {
    const h = Number(a.heir);
    if (!Number.isInteger(h) || h < index) return a;
    return { ...a, heir: h === index ? '0' : String(h - 1) };
  });
  return { ...f, heirs: f.heirs.filter((_, i) => i !== index), assets };
}

/** `symbol` is our own label, never a string read from the token contract. null: a devnet token without one. */
export interface TokenChoice {
  symbol: string | null;
  address: Address;
}

/** Core spec §6 list for X Layer mainnet; addresses as in Plan 1. */
export const XLAYER_TOKENS: readonly TokenChoice[] = [
  { symbol: 'USDT0', address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' },
  { symbol: 'USDC', address: '0xB6CEceAB302E2E4948951eE7843FC24E92933061' },
  { symbol: 'USDG', address: '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8' },
  { symbol: 'WOKB', address: '0xe538905cf8410324e03A5A23C1c177a474D59b2b' },
  { symbol: 'BEM', address: '0x60e62Efa9405d6873C5deaBD4E6CC91c25363952' },
];

export function tokenChoices(d: Deployment): TokenChoice[] {
  if (d.chainId === 196) return [...XLAYER_TOKENS];
  return d.feeTokens.map((address) => ({ symbol: null, address }));
}

/** "TapeOut circuit": circuits are ERC-721 tokens of their processor (Plan 1); this one is Atropyle's. */
export function circuitShortcut(d: Deployment): AssetRow {
  return { kind: 'erc721', token: d.cpu, id: '', heir: '0' };
}
