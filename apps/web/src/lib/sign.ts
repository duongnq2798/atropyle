import {
  type AtropyleClient,
  AtropyleError,
  GUARDIAN_WARNING,
  type InspectedStep,
  type PreparedTx,
  type SendOptions,
  type SendResult,
  type SignPayload,
  type SignRequestCheck,
  sameAddress,
  type TxPlan,
  ZERO_ADDRESS,
} from '@atropyle/sdk';
import type { Address, WalletClient } from 'viem';
import { type CallsResult, type CallsStatus, CallsUnsupported, sendCalls, supportsSendCalls } from './send-calls';
import type { Eip1193 } from './wallet';

export type SignVerdict = 'refused' | 'simulationFailed' | 'connect' | 'wrongAccount' | 'wrongChain' | 'ready';

export interface SignView {
  verdict: SignVerdict;
  canSign: boolean;
  refused: InspectedStep[];
  failed: InspectedStep[];
  guardianWarning: boolean;
}

const isGuardianStep = (s: InspectedStep) =>
  s.warnings.some((w) => w.code === GUARDIAN_WARNING.code) || s.action === 'attestDeath' || s.action === 'voteRecovery';

export function signView(
  check: SignRequestCheck,
  wallet: { account: Address; chainId: number } | null,
  appChainId: number,
): SignView {
  const refused = check.steps.filter((s) => !s.allowed);
  const failed = check.steps.filter((s) => s.simulation.ok === false);
  let verdict: SignVerdict;
  if (refused.length > 0 || check.chainId !== appChainId || check.steps.length === 0) verdict = 'refused';
  else if (failed.length > 0 || !check.ok) verdict = 'simulationFailed';
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
  };
}

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

export type SignOutcome =
  | { kind: 'sendCalls'; result: CallsResult }
  | { kind: 'sequential'; result: SendResult }
  | { kind: 'refused'; check: SignRequestCheck };

/** Re-inspects right before signing, then batches with EIP-5792 when the wallet can, else signs step by step. */
export async function sendSignRequest(
  d: { atro: AtropyleClient; provider: Eip1193; walletClient: WalletClient },
  p: SignPayload,
  o: { onStep?: SendOptions['onStep']; onStatus?: (s: CallsStatus) => void } = {},
): Promise<SignOutcome> {
  const check = await d.atro.handoff.inspect(p);
  if (!check.ok) return { kind: 'refused', check };
  const plan = checkToPlan(p, check);
  if (await supportsSendCalls(d.provider, p.from, p.chainId)) {
    try {
      const result = await sendCalls(d.provider, d.atro.handoff.calls(p), { onStatus: o.onStatus });
      return { kind: 'sendCalls', result };
    } catch (e) {
      if (!(e instanceof CallsUnsupported)) throw e;
    }
  }
  return { kind: 'sequential', result: await d.atro.send(plan, d.walletClient, { onStep: o.onStep }) };
}
