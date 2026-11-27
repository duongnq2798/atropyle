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
  let p: SignPayload;
  try {
    p = decodePayload(saved.payload);
  } catch {
    // The SDK's words are about a signing link; this is the plan the page saved in this tab.
    throw new AtropyleError('LINK_INVALID', {
      message: 'The plan saved in this tab cannot be read.',
      details: { resume: 'unreadable' },
    });
  }
  const total = p.steps.length;
  if (saved.createStep < 0 || saved.createStep >= total) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'The saved plan has no step that creates the vault.',
      details: { resume: 'unreadable' },
    });
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
  let plan: TxPlan;
  try {
    plan = checkToPlan(rest, check);
  } catch (e) {
    // The checks refuse what is left (heirs on chain other than the form's, a step that no longer passes): the same
    // answer every time, which the page says in its own words.
    if (e instanceof AtropyleError && e.code === 'LINK_INVALID') {
      throw new AtropyleError('LINK_INVALID', { message: e.message, details: { resume: 'mismatch' }, cause: e });
    }
    throw e;
  }
  return { plan: { ...plan, vault: saved.vault }, offset, total, created };
}

/** Why a resume fails the same way every time, in words the page has for it. */
export type ResumeFailure = 'unreadable' | 'mismatch';

/** The ResumeFailure of an error resumePlan threw; null for any other error (the RPC's, which Retry may cure). */
export function resumeFailure(e: unknown): ResumeFailure | null {
  if (!(e instanceof AtropyleError)) return null;
  const why = e.details?.resume;
  return why === 'unreadable' || why === 'mismatch' ? why : null;
}
