import type { VaultAction, VaultConfig, VaultSnapshot, VaultStatus } from '@atropyle/sdk';
import { formTokens } from '@/app/create/plan-tokens';
import type { GuardianFields } from '@/flows/editors/guardians-editor';
import type { AssetRow, HeirRow, TimingForm } from '@/flows/impl/create-form';
import type { FlowsImpl } from '@/flows/load';
import type { Lang } from '@/i18n/core';
import type { MirrorToken } from '@/tx/mirror';
import type { FlowProgress } from './action-flow';

/** Spec §18.4.2 T10: the five phases of the check-in ritual. */
export type RitualPhase = 'idle' | 'holding' | 'wallet' | 'sent' | 'tied';

/** The hold on the button: none, held, or done (a full hold, or Enter) and waiting for the wallet to open. */
export type HoldState = 'off' | 'on' | 'armed';

export const IDLE_PROGRESS: FlowProgress = { committed: false, finished: false, busy: false, sent: false };

/**
 * The phase, from the runner first: it is never ahead of it. `tied` needs the receipt (`finished` is
 * runner.result !== null), so no knot ties and nothing says "Confirmed" before one (R18.16).
 */
export function ritualPhase(hold: HoldState, p: FlowProgress): RitualPhase {
  if (p.finished) return 'tied';
  if (p.sent) return 'sent';
  if (p.busy || p.committed) return 'wallet';
  return hold === 'off' ? 'idle' : 'holding';
}

/** "0.8 s", "0,8 s": one decimal, the language's own separator, never broken from its unit. */
export function formatSeconds(ms: number, lang: Lang): string {
  const s = (Math.max(0, ms) / 1000).toFixed(1);
  return `${lang === 'vi' ? s.replace('.', ',') : s}\u00a0s`;
}

export type DueKind = 'dueActive' | 'dueGrace' | 'dueRecovery' | 'dueLate';

/**
 * When the next check-in is due, by the stored state. Once the rules move the vault on (pending past the state, not
 * back to active) the owner is late, yet ALIVE wins until somebody pokes: the line says so, with no date.
 */
export function dueOf(
  s: Pick<VaultStatus, 'state' | 'pending' | 'expired' | 'lateAt' | 'windowEndsAt'>,
): { kind: DueKind; at: bigint | null } | null {
  if (s.expired || s.state === 'releasedInherit' || s.state === 'releasedRecover') return null;
  if (s.pending !== s.state && s.pending !== 'active') return { kind: 'dueLate', at: null };
  if (s.state === 'active') return { kind: 'dueActive', at: s.lateAt };
  return { kind: s.state === 'grace' ? 'dueGrace' : 'dueRecovery', at: s.windowEndsAt };
}

/**
 * The tokens a plan of this owner may approve, for the wallet mirror: the vault's assets as read (symbols stay
 * untrusted), then the tokens typed in the assets form, unnamed (their amounts read in base units).
 */
export function ownerTokens(snap: VaultSnapshot, rows: readonly AssetRow[] = []): MirrorToken[] {
  const out = new Map<string, MirrorToken>();
  for (const a of snap.status.assets) {
    const key = a.asset.token.toLowerCase();
    if (!out.has(key)) {
      out.set(key, { address: a.asset.token, kind: a.asset.kind, symbol: a.token.symbol, decimals: a.token.decimals });
    }
  }
  for (const t of formTokens(rows, null)) {
    const key = t.address.toLowerCase();
    if (!out.has(key)) out.set(key, t);
  }
  return [...out.values()];
}

export type EditPart = 'heirs' | 'guardians' | 'timing' | 'assets';
export const EDIT_PARTS: readonly EditPart[] = ['heirs', 'guardians', 'timing', 'assets'];

/** The four forms of the owner's editor, as the wizard's editors hold them. */
export interface EditForms {
  heirs: HeirRow[];
  guardians: GuardianFields;
  timing: TimingForm;
  assets: AssetRow[];
}

/** The forms as the vault stands. */
export function formsOf(flows: FlowsImpl, c: VaultConfig, drill: boolean): EditForms {
  return {
    heirs: flows.heirRows(c.heirs),
    guardians: {
      guardians: [...c.guardians],
      k: c.guardians.length === 0 ? '' : String(c.k),
      recoveryEnabled: c.recoveryEnabled,
    },
    timing: flows.timingFormOf(c.timing, drill),
    assets: flows.assetRows(c.assets),
  };
}

/** One part's save: the SDK prepares and checks it; the form only says what was typed. */
export function editAction(flows: FlowsImpl, part: EditPart, f: EditForms): VaultAction {
  switch (part) {
    case 'heirs':
      return { type: 'setHeirs', heirs: flows.heirsInput(f.heirs) };
    case 'guardians':
      return flows.guardiansAction(f.guardians.guardians, f.guardians.k, f.guardians.recoveryEnabled);
    case 'timing':
      return { type: 'setTiming', timing: flows.timingInput(f.timing) };
    case 'assets':
      return { type: 'setAssets', assets: flows.assetsInput(f.assets) };
  }
}
