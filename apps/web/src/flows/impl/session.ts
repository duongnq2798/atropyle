import { encodePayload, LIMITS, type TxPlan, toPayload } from '@atropyle/sdk';
import { type Address, type Hex, isAddress, isHex } from 'viem';
import { type AssetRow, type CreateForm, type HeirRow, initialForm, type TimingForm } from './create-form';
import { WIZARD_STEPS, type WizardStep } from './wizard';

export const SESSION_KEY = 'atropyle:create';

export interface WizardState {
  step: WizardStep;
  form: CreateForm;
  /** One salt per wizard: every prepare predicts the same vault, and a second createVault for it reverts. */
  salt: Hex;
  feeToken: Address | null;
  /** encodePayload(toPayload(plan)) once the review step prepared a plan (Task 8 resumes from it). */
  payload: string | null;
  /** The plan's vault (predicted until createVault confirms). */
  vault: Address | null;
  /** Index of the createVault step in the payload; -1 before a plan exists. */
  createStep: number;
  /** Steps of the payload the chain confirmed. */
  offset: number;
}

export function newSalt(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): Hex {
  return `0x${Array.from(random(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function freshState(form: CreateForm, salt: Hex): WizardState {
  return { step: 'kind', form, salt, feeToken: null, payload: null, vault: null, createStep: -1, offset: 0 };
}

/** What the session keeps of a prepared plan. A plan above the SDK's payload limits keeps no payload (no resume). */
export function savedPlan(plan: TxPlan): Pick<WizardState, 'payload' | 'vault' | 'createStep' | 'offset'> {
  let payload: string | null;
  try {
    payload = encodePayload(toPayload(plan));
  } catch {
    payload = null;
  }
  return { payload, vault: plan.vault, createStep: plan.steps.findIndex((s) => s.action === 'createVault'), offset: 0 };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 200;
const listOf = <T>(v: unknown, max: number, item: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.length <= max && v.every(item);
const heirRow = (x: unknown): x is HeirRow => isObj(x) && text(x.account) && text(x.percent);
const assetRow = (x: unknown): x is AssetRow =>
  isObj(x) &&
  (x.kind === 'erc20' || x.kind === 'erc721' || x.kind === 'erc1155') &&
  text(x.token) &&
  text(x.id) &&
  text(x.heir);
const timingForm = (x: unknown): x is TimingForm =>
  isObj(x) &&
  ['drill', 'sixMonths', 'twelveMonths', 'custom'].includes(x.preset as string) &&
  text(x.period) &&
  text(x.threshold) &&
  text(x.window);

function createForm(x: unknown): x is CreateForm {
  return (
    isObj(x) &&
    typeof x.drill === 'boolean' &&
    (x.template === 'simple' || x.template === 'guarded') &&
    listOf(x.heirs, LIMITS.maxHeirs, heirRow) &&
    x.heirs.length >= 1 &&
    listOf(x.guardians, LIMITS.maxGuardians, text) &&
    text(x.k) &&
    typeof x.recoveryEnabled === 'boolean' &&
    timingForm(x.timing) &&
    listOf(x.assets, LIMITS.maxAssets, assetRow)
  );
}

const addressOrNull = (v: unknown): v is Address | null => v === null || (typeof v === 'string' && isAddress(v));
const index = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= 64;

/** The tab's own sessionStorage, yet a stale or hand-edited value must never break the page: anything off is null. */
export function reviveSession(raw: unknown): WizardState | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const { step, form, salt, feeToken, payload, vault, createStep, offset } = raw;
  if (!WIZARD_STEPS.includes(step as WizardStep) || !createForm(form)) return null;
  if (!(typeof salt === 'string' && isHex(salt) && salt.length === 66)) return null;
  if (!addressOrNull(feeToken) || !addressOrNull(vault)) return null;
  if (!(payload === null || (typeof payload === 'string' && payload.length <= 200_000))) return null;
  if (!index(createStep, -1) || !index(offset, 0)) return null;
  // The done screen names its vault: a done step without one is never shown (Ruling 9).
  if (step === 'done' && vault === null) return null;
  return { step: step as WizardStep, form, salt, feeToken, payload, vault, createStep, offset };
}

/**
 * The form for the other kind: the people stay, guardians and timing take that kind's defaults (initialForm: a Drill
 * starts without guardians and in minutes, a real vault with guardians and in months).
 */
export function withKind(f: CreateForm, drill: boolean): CreateForm {
  if (f.drill === drill) return f;
  const base = initialForm(drill);
  const guardians = base.template === 'guarded' && f.guardians.length === 0 ? base.guardians : f.guardians;
  return { ...f, drill, template: base.template, timing: base.timing, guardians };
}
