'use client';

import { TriangleExclamationPoint } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { messages } from '@/messages/tx-flow.messages';
import { Address } from '@/ui/address';
import { Amount } from '@/ui/amount';
import { UntrustedText } from '@/ui/untrusted-text';
import { networkName } from '@/wallet/network';
import {
  approvalSpender,
  type ContractRole,
  isZero,
  type MirrorCall,
  type MirrorDanger,
  mirrorDangers,
} from './mirror';

const ROLE_KEY = {
  factory: 'roleFactory',
  vault: 'roleVault',
  token: 'roleToken',
  feeToken: 'roleFeeToken',
  other: 'roleOther',
} as const satisfies Record<ContractRole, string>;

const DANGER_KEY = {
  unlimited: 'dangerUnlimited',
  all: 'dangerAll',
  unknownSpender: 'dangerUnknownSpender',
  unknownContract: 'dangerUnknownContract',
  unknownCall: 'dangerUnknownCall',
} as const satisfies Record<MirrorDanger, string>;

/**
 * X Layer's native coin; the mirror shows the value even when it is 0, so the reader can check nothing is sent. A
 * constant of this page, not chain text: plain text, never UntrustedText (Amount's symbol path would mark it).
 */
const NATIVE = 'OKB';

/**
 * Label and value side by side while the box has room; in a narrow box (a phone, inside a step) the label sits above
 * its value, so a full address keeps the width and wraps in two or three lines instead of ten. Side by side, the
 * label column starts at 8rem so that the bundle's network row and each call's fields line up.
 */
const FIELDS =
  'grid grid-cols-1 gap-y-0.5 text-small @sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] @sm:items-baseline ' +
  '@sm:gap-x-4 @sm:gap-y-2';

function Field({ label, testId, children }: { label: string; testId?: string; children: ReactNode }) {
  return (
    <>
      <dt className="mt-2 text-ink-muted first:mt-0 @sm:mt-0">{label}</dt>
      <dd data-testid={testId} className="min-w-0 text-ink">
        {children}
      </dd>
    </>
  );
}

function Danger({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p data-testid={testId} className="flex items-start gap-2 text-danger text-small">
      <TriangleExclamationPoint aria-hidden="true" size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * An address the wallet will show, and in a caption who it is to this plan. The copy and explorer buttons drop below
 * the address when its block of two rows of five groups (25ch) does not fit beside them, so the block never breaks
 * into rows of three that no longer compare with the wallet's group by group.
 */
function Party({
  address,
  caption,
  danger = false,
  copy = true,
  explorer,
}: {
  address: string;
  caption: string;
  danger?: boolean;
  /** false for an address the signer must type from elsewhere (a vote's new wallet, spec §16.3), never copy here. */
  copy?: boolean;
  explorer: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Address
        address={address}
        size="sm"
        avatar={false}
        copy={copy}
        explorer={explorer}
        className="flex-wrap gap-y-1"
      />
      <span className={cn('text-caption', danger ? 'text-danger' : 'text-ink-muted')}>{caption}</span>
    </span>
  );
}

function Approves({ call }: { call: MirrorCall }) {
  const t = useT(messages);
  const a = call.approval;
  if (!a) return null;
  switch (a.kind) {
    case 'erc20':
      if (a.amount === 0n) return t('approveNone');
      if (a.unlimited) return <strong className="text-danger">{t('approveUnlimited')}</strong>;
      // The symbol was read from the chain: in the Ledger voice with the figure, like every chain text (§18.2.7).
      return (
        <Amount
          raw={a.amount}
          decimals={call.token?.decimals ?? null}
          symbol={call.token?.symbol ?? null}
          className="voice-ledger"
        />
      );
    case 'erc721':
      return isZero(a.spender) ? (
        t('approveNftNone', { id: a.id })
      ) : (
        <span className="voice-ledger">{t('approveNft', { id: a.id })}</span>
      );
    case 'all':
      return a.on ? <strong className="text-danger">{t('approveAll')}</strong> : t('approveAllNone');
    case 'unknown':
      return <span className="voice-ledger">{t('approveRaw', { raw: a.raw })}</span>;
  }
}

function Network({ chainId }: { chainId: number }) {
  const t = useT(messages);
  return (
    <Field label={t('mirrorNetwork')}>
      <span className="voice-ledger">{`${networkName(chainId)} (${chainId})`}</span>
    </Field>
  );
}

function CallFields({
  call,
  explorer,
  testId,
  network = true,
}: {
  call: MirrorCall;
  explorer: string | null;
  testId: string;
  network?: boolean;
}) {
  const t = useT(messages);
  const a = call.approval;
  const spender = a ? approvalSpender(a) : null;
  return (
    <>
      <dl className={FIELDS}>
        {network ? <Network chainId={call.chainId} /> : null}
        <Field label={t('mirrorContract')}>
          <Party
            address={call.to}
            caption={t(ROLE_KEY[call.role])}
            danger={call.role === 'other'}
            explorer={explorer}
          />
        </Field>
        <Field label={t('mirrorFn')}>
          <code className="voice-ledger">{call.fn}</code>
        </Field>
        <Field label={t('mirrorSends')} testId={`${testId}-mirror-${call.index}-sends`}>
          {/* Every one of the 18 decimals, never truncated: the reader compares it with the wallet's figure. */}
          <span className="voice-ledger tabular-nums">{`${formatAmount(call.value, 18, 18)} ${NATIVE}`}</span>
        </Field>
        {call.vote ? (
          <Field label={t('mirrorVotesFor')}>
            {isZero(call.vote) ? (
              t('mirrorWithdraw')
            ) : (
              <Party address={call.vote} caption={t('roleNewWallet')} copy={false} explorer={explorer} />
            )}
          </Field>
        ) : null}
        {a ? (
          <>
            <Field label={t('mirrorToken')} testId={`${testId}-mirror-${call.index}-token`}>
              {call.token?.symbol ? (
                <UntrustedText value={call.token.symbol} max={32} className="voice-ledger" />
              ) : (
                // A token of the plan whose name was not read (an NFT, or a plan resumed after a reload) is still listed.
                <span className="text-ink-muted">{t(call.token ? 'tokenNameless' : 'tokenUnknown')}</span>
              )}
            </Field>
            {spender && !isZero(spender) ? (
              <Field label={a.kind === 'all' ? t('mirrorOperator') : t('mirrorSpender')}>
                <Party
                  address={spender}
                  caption={t(ROLE_KEY[a.spenderRole])}
                  danger={a.spenderRole === 'other'}
                  explorer={explorer}
                />
              </Field>
            ) : null}
            <Field label={t('mirrorApproves')}>
              <Approves call={call} />
            </Field>
          </>
        ) : null}
      </dl>
      {mirrorDangers(call).map((d) => (
        <Danger key={d} testId={`${testId}-mirror-${call.index}-danger-${d}`}>
          {t(DANGER_KEY[d])}
        </Danger>
      ))}
    </>
  );
}

/**
 * "Your wallet should show" (R18.8): one call, or every call of a wallet_sendCalls bundle, decoded from calldata.
 * The words say "should show" and copy no wallet's look: each wallet draws its own window.
 */
export function MirrorBox({
  calls,
  explorer,
  testId,
  bundle = false,
  wide = false,
}: {
  calls: readonly MirrorCall[];
  explorer: string | null;
  testId: string;
  bundle?: boolean;
  /**
   * Inside a step: on a phone the box leaves the step's indent for the card's full width, as the bundle's box has,
   * so an address keeps its two rows of five with the buttons beside it. It is opaque there (the same colour as
   * 60% over the card), over the thread between the knots.
   */
  wide?: boolean;
}) {
  const t = useT(messages);
  const headingId = useId();
  const first = calls[0];
  if (!first) return null;
  // wallet_sendCalls takes one chainId for the whole bundle, so its calls share it; named once, as the wallet does.
  const oneNetwork = bundle && calls.every((c) => c.chainId === first.chainId);
  // A bundle of one call is what the wallet shows as one call: no count, no "Call 1".
  const many = calls.length > 1;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={bundle ? `${testId}-mirror-bundle` : `${testId}-mirror-${first.index}`}
      className={cn(
        '@container mt-2 flex flex-col gap-3 rounded-2xl border border-line-strong p-3 sm:p-4',
        wide
          ? 'relative z-10 -ml-12 bg-[color-mix(in_oklab,var(--color-surface-2)_60%,var(--color-surface-1))] sm:ml-0 sm:bg-surface-2/60'
          : 'bg-surface-2/60',
      )}
    >
      <h4 id={headingId} className="text-balance font-medium text-ink text-small">
        {bundle && many ? t('mirrorBundle', { n: calls.length }) : t('mirrorTitle')}
      </h4>
      {oneNetwork ? (
        <dl className={FIELDS}>
          <Network chainId={first.chainId} />
        </dl>
      ) : null}
      {bundle ? (
        <ol className="flex flex-col gap-4">
          {calls.map((c, i) => (
            <li
              key={c.index}
              data-testid={`${testId}-mirror-${c.index}`}
              className="flex flex-col gap-2 border-line border-t pt-3"
            >
              {many ? (
                <p className="font-medium text-caption text-ink-muted uppercase tracking-[0.16em]">
                  {t('mirrorCall', { n: i + 1 })}
                </p>
              ) : null}
              <CallFields call={c} explorer={explorer} testId={testId} network={!oneNetwork} />
            </li>
          ))}
        </ol>
      ) : (
        <CallFields call={first} explorer={explorer} testId={testId} />
      )}
      <Danger testId={`${testId}-mirror-reject`}>{t('dangerReject')}</Danger>
    </section>
  );
}
