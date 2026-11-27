import {
  AtropyleError,
  type ConfirmAddress,
  GUARDIAN_WARNING,
  type InspectedStep,
  type PreparedTx,
  type SignPayload,
  type SignRequestCheck,
  sameAddress,
  type TxPlan,
  vaultAbi,
  ZERO_ADDRESS,
} from '@atropyle/sdk';
import { type Address, decodeFunctionData, type Hex } from 'viem';
import { type BatchOutcome, type SendDeps, type SendHooks, sendBatchOrSequential } from '@/tx/impl/calls';

/**
 * unproven: the request needs addresses typed again, and a step was not simulated after the ones before it (an
 * endpoint without eth_simulateV1 skips a later step that fails alone). The SDK keeps such a request from `ok`
 * whatever is typed, since the addresses hold only if every step runs.
 */
export type SignVerdict =
  | 'refused'
  | 'simulationFailed'
  | 'unproven'
  | 'connect'
  | 'wrongAccount'
  | 'wrongChain'
  | 'ready';

export interface SignView {
  verdict: SignVerdict;
  canSign: boolean;
  refused: InspectedStep[];
  failed: InspectedStep[];
  guardianWarning: boolean;
  /**
   * The addresses the signer must type again (a Drill with a token allowance); empty when none. While any is not
   * typed, the check is not `ok`, but the verdict stays the one the rest of the request earns.
   */
  confirm: ConfirmAddress[];
}

export const isGuardianStep = (s: InspectedStep) =>
  s.warnings.some((w) => w.code === GUARDIAN_WARNING.code) || s.action === 'attestDeath' || s.action === 'voteRecovery';

/** The wallet a voteRecovery calldata votes for, the zero address for a withdrawal, or null for anything else. */
function voteTargetOf(data: Hex | undefined): Address | null {
  if (!data) return null;
  try {
    const call = decodeFunctionData({ abi: vaultAbi, data });
    return call.functionName === 'voteRecovery' ? call.args[0] : null;
  } catch {
    return null;
  }
}

export interface VoteStep {
  index: number;
  /** Decoded from the payload's calldata; null when it does not decode, which no typed address can match. */
  target: Address | null;
}

/**
 * The steps that vote for a new wallet: the guardian must type that wallet before signing (spec §16.3). The target
 * is decoded from the bytes that will be signed, never read from the link's text. A withdrawal names no wallet.
 */
export function voteSteps(p: SignPayload, c: SignRequestCheck): VoteStep[] {
  return c.steps.flatMap((s) => {
    if (s.action !== 'voteRecovery') return [];
    const target = voteTargetOf(p.steps[s.index]?.data);
    return target !== null && sameAddress(target, ZERO_ADDRESS) ? [] : [{ index: s.index, target }];
  });
}

export function signView(
  check: SignRequestCheck,
  wallet: { account: Address; chainId: number } | null,
  appChainId: number,
): SignView {
  const refused = check.steps.filter((s) => !s.allowed);
  const failed = check.steps.filter((s) => s.simulation.ok === false);
  const awaitingConfirm = check.confirm?.confirmed === false;
  const unproven = check.confirm !== null && check.steps.some((s) => s.simulation.ok === 'skipped');
  let verdict: SignVerdict;
  if (refused.length > 0 || check.chainId !== appChainId || check.steps.length === 0) verdict = 'refused';
  else if (failed.length > 0) verdict = 'simulationFailed';
  else if (unproven) verdict = 'unproven';
  else if (!check.ok && !awaitingConfirm) verdict = 'simulationFailed';
  else if (!wallet) verdict = 'connect';
  else if (!sameAddress(wallet.account, check.from)) verdict = 'wrongAccount';
  else if (wallet.chainId !== check.chainId) verdict = 'wrongChain';
  else verdict = 'ready';
  return {
    verdict,
    canSign: verdict === 'ready' || verdict === 'wrongChain',
    refused,
    failed,
    guardianWarning: check.steps.some(isGuardianStep),
    confirm: check.confirm?.addresses ?? [],
  };
}

/** The key of an address to confirm: its vault, role and position, which a resumed request keeps. */
export const confirmKey = (a: ConfirmAddress) => `${a.vault.toLowerCase()}:${a.role}:${a.index}`;

const mismatch = (why: string) =>
  new AtropyleError('LINK_INVALID', { message: `The signing request changed: ${why}.` });

/** The plan `atro.send` needs, rebuilt from the payload bytes and the summaries `inspect` produced. */
export function checkToPlan(p: SignPayload, c: SignRequestCheck): TxPlan {
  if (!c.ok) throw mismatch('it did not pass the checks');
  if (c.steps.length !== p.steps.length) throw mismatch('the number of steps differs');
  if (c.chainId !== p.chainId || !sameAddress(c.from, p.from)) throw mismatch('the signer or chain differs');
  const steps: PreparedTx[] = p.steps.map((s, i) => {
    const x = c.steps[i];
    if (!sameAddress(x.to, s.to) || x.value !== s.value || x.action === null) throw mismatch(`step ${i + 1} differs`);
    return {
      chainId: p.chainId,
      from: p.from,
      to: s.to,
      data: s.data,
      value: s.value,
      action: x.action,
      summary: x.summary ?? '',
      warnings: x.warnings,
      simulation: x.simulation,
    };
  });
  return {
    chainId: p.chainId,
    from: p.from,
    vault: c.vault ?? ZERO_ADDRESS,
    steps,
    summary: steps.map((s) => s.summary).join(' '),
    warnings: c.steps.some(isGuardianStep) ? [GUARDIAN_WARNING] : [],
  };
}

export type SignOutcome = BatchOutcome | { kind: 'refused'; check: SignRequestCheck };

/**
 * Re-inspects right before signing, then sends through the app's one send path (sendBatchOrSequential): one EIP-5792
 * bundle when the wallet can, else step by step. When the request needs addresses typed again, `confirm` gives what
 * the signer typed for each one the SDK asks for (7B-main-sync §7).
 */
export async function sendSignRequest(
  d: SendDeps,
  p: SignPayload,
  o: SendHooks & { confirm?: (addresses: readonly ConfirmAddress[]) => string[] } = {},
): Promise<SignOutcome> {
  let check = await d.atro.handoff.inspect(p);
  if (check.confirm && !check.confirm.confirmed && o.confirm) {
    check = await d.atro.handoff.inspect(p, { confirmed: o.confirm(check.confirm.addresses) });
  }
  if (!check.ok) return { kind: 'refused', check };
  return sendBatchOrSequential(d, checkToPlan(p, check), o);
}
