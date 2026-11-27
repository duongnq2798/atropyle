import { explorerAddress, explorerBlock } from '@/lib/links';
import type { VaultVerification } from '@/verify/types';
import type { RowId, RowState, VerifyRow } from '@/verify/verify-view';

export type LineId = 'real' | 'rules' | 'operators';
export type LineState = RowState | 'checking';
/** The page's one answer. `partial` means "could not check everything here", which is never a failure. */
export type Overall = 'pending' | 'pass' | 'fail' | 'partial';

export const LINE_IDS: readonly LineId[] = ['real', 'rules', 'operators'];

/** Spec §5.5: three plain lines, each standing for the technical rows under it. */
export const LINE_ROWS: Readonly<Record<LineId, readonly RowId[]>> = {
  real: ['factory', 'proxy', 'code'],
  rules: ['binding', 'policy'],
  operators: ['operators'],
};

export interface VerifyLine {
  id: LineId;
  state: LineState;
  rows: VerifyRow[];
}

/**
 * A failed row fails its line at once. While the policy proof still runs, the rules line reads "checking": the
 * policy row is unknown until the proof ends, and that is not a failure.
 */
export function verifyLines(rows: readonly VerifyRow[], proofRunning: boolean): VerifyLine[] {
  return LINE_IDS.map((id) => {
    const mine = rows.filter((r) => LINE_ROWS[id].includes(r.id));
    const state: LineState = mine.some((r) => r.state === 'fail')
      ? 'fail'
      : mine.every((r) => r.state === 'pass')
        ? 'pass'
        : proofRunning && id === 'rules'
          ? 'checking'
          : 'unknown';
    return { id, state, rows: mine };
  });
}

/** A failure is told at once; otherwise the answer waits for the proof, then is pass or partial. */
export function overallOf(rows: readonly VerifyRow[], proofRunning: boolean): Overall {
  if (rows.some((r) => r.state === 'fail')) return 'fail';
  if (proofRunning) return 'pending';
  return rows.every((r) => r.state === 'pass') ? 'pass' : 'partial';
}

/** Where to check each line by hand: the vault itself, the processor its rules run on, the block that was read. */
export function lineLink(id: LineId, o: { explorer: string; vault: string; cpu: string; block: bigint }): string {
  if (id === 'real') return explorerAddress(o.explorer, o.vault);
  if (id === 'rules') return explorerAddress(o.explorer, o.cpu);
  return explorerBlock(o.explorer, o.block);
}

/** The P9 seed this page drew, once the proof that used it is in; null before, and when P9 did not run. */
export function p9SeedOf(v: VaultVerification): bigint | null {
  return v.policy.status === 'verified' ? (v.policy.result.p9?.seed ?? null) : null;
}

/** What the command says in place of an address the page does not know (without JavaScript it reads no hash). */
export const ADDRESS_PLACEHOLDER = '<address>';

/**
 * `npx atropyle verify` for this vault, pinned to the SDK release the page was built with. With the page's P9 seed, the
 * CLI asks the processor the very vectors this page asked.
 */
export function verifyCommand(version: string, vault: string, p9Seed: bigint | null): string {
  const seed = p9Seed === null ? '' : ` --p9-seed ${p9Seed.toString(10)}`;
  return `npx -y atropyle@${version} verify --vault ${vault}${seed}`;
}

/** Longer than this is the vault's address, which may break anywhere; every other word stays whole. */
const LONG_WORD = 24;

/**
 * The command in words. A browser may break a line right after a hyphen ("npx -" / "y", 7C T3 Ruling R-FLAG), so each
 * word is kept whole, except the address, which is too long for a phone line.
 */
export function commandWords(command: string): { text: string; long: boolean }[] {
  return command.split(' ').map((text) => ({ text, long: text.length > LONG_WORD }));
}
