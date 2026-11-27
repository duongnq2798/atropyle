'use client';

import type { SignPayload, SignRequestCheck, TxPlan } from '@atropyle/sdk';
import { useMemo, useState } from 'react';
import { useInvalidateVault } from '@/chain/hooks';
import type { FlowsImpl } from '@/flows/load';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/sign.messages';
import { vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { planIsIrreversible } from '@/tx/irreversible';
import type { MirrorToken } from '@/tx/mirror';
import { TxCard } from '@/tx/tx-card';
import { useTxRunner } from '@/tx/use-tx-runner';
import { Banner } from '@/ui/banner';
import { buttonClass } from '@/ui/button';
import { ConfirmGate, type ConfirmRow } from './confirm-gate';
import { VoteGate, type VoteRow } from './vote-gate';

const errorCode = (e: unknown): string | null =>
  typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string'
    ? (e as { code: string }).code
    : null;

/**
 * What the signer types, then TxCard: the half of the page that signs. It loads in its own chunk (send-chunk.ts),
 * since it shows only once inspect has answered and leaves something to sign.
 */
export function SignSend({
  plan,
  payload,
  check,
  flows,
  tokens,
  guardian,
  onRefused,
}: {
  plan: TxPlan;
  payload: SignPayload;
  check: SignRequestCheck;
  flows: FlowsImpl;
  tokens: readonly MirrorToken[];
  guardian: boolean;
  onRefused(check: SignRequestCheck): void;
}) {
  const t = useT(messages);
  const invalidate = useInvalidateVault();
  // Typed by the signer, never filled from the link: the votes by step, the Drill recipients by confirmKey.
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [retyped, setRetyped] = useState<Record<string, string>>({});
  const voteSteps = useMemo(() => flows.voteSteps(payload, check), [flows, payload, check]);
  const votes: VoteRow[] = voteSteps.map((v) => ({
    index: v.index,
    reason: flows.typedReason(typed[v.index] ?? '', v.target),
  }));
  const confirms: ConfirmRow[] = (check.confirm?.addresses ?? []).map((a, i) => {
    const key = flows.confirmKey(a);
    return { address: a, i, key, reason: flows.typedReason(retyped[key] ?? '', a.account) };
  });
  const open = votes.every((v) => v.reason === null) && confirms.every((r) => r.reason === null);
  const sender = useMemo(
    () =>
      flows.signSenderWith({
        typed: (a) => retyped[flows.confirmKey(a)] ?? '',
        open: () => open,
        refused: onRefused,
      }),
    [flows, retyped, open, onRefused],
  );
  const vault = check.vault;
  const runner = useTxRunner({
    plan,
    sender,
    handoff: false,
    tokens,
    onDone: () => {
      if (vault) void invalidate(vault);
    },
  });
  const done = runner.result !== null;
  // Once the wallet holds something, what was typed is what is being sent: it stays as it is.
  const locked = runner.busy || runner.committed;
  const n = plan.steps.length;
  const resumeRefused = !done && runner.offset > 0 && errorCode(runner.error) === 'LINK_INVALID';
  return (
    <div className="flex flex-col gap-6">
      {guardian && !done ? (
        <Banner tone="warn" title={t('guardianTitle')} testId="sign-guardian">
          {t('guardianPlain')}
        </Banner>
      ) : null}
      {votes.length > 0 && !done ? (
        <VoteGate rows={votes} typed={typed} locked={locked} onType={(i, v) => setTyped((s) => ({ ...s, [i]: v }))} />
      ) : null}
      {confirms.length > 0 && !done ? (
        <ConfirmGate
          rows={confirms}
          typed={retyped}
          locked={locked}
          recipients={check.confirm?.reason === 'DRILL_RECIPIENTS_CHANGED'}
          onType={(k, v) => setRetyped((s) => ({ ...s, [k]: v }))}
        />
      ) : null}
      <TxCard
        runner={runner}
        label={n === 1 ? t('signOne') : t('signMany', { n })}
        // TxCard's own done title ("Signed and recorded") names the Receipt: the page's title only names the steps.
        title={done ? undefined : t('txTitle')}
        tone={planIsIrreversible(plan) ? 'danger' : 'thread'}
        disabled={!open}
        testId="sign-tx"
        receiptFooter={
          vault ? (
            <NavLink
              href={vaultHref(vault)}
              data-testid="sign-open-vault"
              className={buttonClass({ variant: 'secondary' })}
            >
              {t('openVault')}
            </NavLink>
          ) : null
        }
      />
      {resumeRefused ? (
        <Banner
          tone="info"
          testId="sign-resume-blocked"
          action={
            vault ? (
              <NavLink href={vaultHref(vault)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                {t('openVaultToFinish')}
              </NavLink>
            ) : undefined
          }
        >
          {t('resumeBlocked')}
        </Banner>
      ) : null}
    </div>
  );
}
