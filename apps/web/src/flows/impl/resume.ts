import {
  type AtropyleClient,
  AtropyleError,
  decodePayload,
  type SignPayload,
  type SignRequestCheck,
  sameAddress,
  type TxPlan,
} from '@atropyle/sdk';
import type { Address } from 'viem';
import { type CreateForm, formToPlan } from './create-form';
import { checkToPlan } from './sign';

/** What the session keeps of a prepared plan (savedPlan, session.ts), once a reload lost the plan itself. */
export interface ResumeInput {
  payload: string;
  vault: Address;
  createStep: number;
  offset: number;
}

export interface Resumed {
  /** The steps still to send, inspected again; null when every step is on chain. */
  plan: TxPlan | null;
  /** Steps of the saved payload already on chain. */
  offset: number;
  total: number;
  /** The vault has code: createVault ran, whatever the saved offset says. */
  created: boolean;
}

/**
 * What the owner typed for each address a Drill check asks to see again (AddressConfirmation), taken from the form
 * the plan was prepared from in this tab, never from the payload: the check then proves that the vault on chain, or
 * the createVault calldata, gives the assets to the people the owner typed. An address of another vault, or a role or
 * index the form lacks, stays empty and fails the check. null: the check needs nothing typed.
 */
export function confirmFromForm(check: SignRequestCheck, form: CreateForm, vault: Address): string[] | null {
  if (!check.confirm || check.confirm.confirmed) return null;
  const plan = formToPlan(form);
  const guardians = plan.guardians ?? [];
  return check.confirm.addresses.map((a) => {
    if (!sameAddress(a.vault, vault)) return '';
    return (a.role === 'heir' ? plan.heirs[a.index]?.account : guardians[a.index]) ?? '';
  });
}

/**
 * Rebuilds what is left of a saved create plan after a reload (Decision 4 of Plan 7B). Three sources, in order of
 * trust: the code at the vault's address (chain), the saved offset (the page saves it after every confirmation), then
 * the payload. The chain decides whether createVault ran; the saved offset only adds the steps confirmed before or
 * after it. Only the rest is inspected and simulated again, with the same calldata and salt: a createVault that ran
 * fails its simulation (the salt is used), and inspect refuses a createVault of a vault that exists, so no second vault.
 */
export async function resumePlan(
  atro: Pick<AtropyleClient, 'publicClient' | 'handoff'>,
  saved: ResumeInput,
  form: CreateForm,
): Promise<Resumed> {
  const p = decodePayload(saved.payload);
  const total = p.steps.length;
  if (saved.createStep < 0 || saved.createStep >= total) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'The saved plan has no step that creates the vault.' });
  }
  const code = await atro.publicClient.getCode({ address: saved.vault });
  const created = code !== undefined && code !== '0x';
  const offset = created
    ? Math.min(total, Math.max(saved.offset, saved.createStep + 1))
    : Math.min(saved.offset, saved.createStep);
  if (offset >= total) return { plan: null, offset, total, created };
  const rest: SignPayload = { ...p, steps: p.steps.slice(offset) };
  let check = await atro.handoff.inspect(rest);
  const confirmed = confirmFromForm(check, form, saved.vault);
  if (confirmed) check = await atro.handoff.inspect(rest, { confirmed });
  return { plan: { ...checkToPlan(rest, check), vault: saved.vault }, offset, total, created };
}
