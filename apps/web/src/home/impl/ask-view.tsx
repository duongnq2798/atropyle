import { Check, Minus, X } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { XLAYER_EXPLORER } from '@/config/env';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { explorerBlock } from '@/lib/links';
import { messages as ask } from '@/messages/ask.messages';
import { ExternalLink } from '@/ui/external-link';
import { UntrustedText } from '@/ui/untrusted-text';
import { VisuallyHidden } from '@/ui/visually-hidden';
import type { AskOutcome, OperatorAnswer, StepAnswer } from './ask';

export { askXLayer } from './ask';

/** Row 1, the product's voice: what X Layer said. */
const SAID = 'flex items-start gap-1.5 text-body';
/** Row 2, the Ledger voice (spec §18.2 principle 7): the block and the bytes are read from the chain. */
const LEDGER = 'block font-mono text-ink-muted text-small tabular-nums';
const MARK = {
  same: { Icon: Check, tone: 'text-alive', label: 'opSame' },
  different: { Icon: X, tone: 'text-danger', label: 'opDifferent' },
  reverted: { Icon: X, tone: 'text-danger', label: 'opRefused' },
  unreachable: { Icon: Minus, tone: 'text-ink-muted', label: 'opNone' },
} as const;

/** One operator and how it answered, as an icon with a hidden word: "OKX ✓" without a ✓ character (glyphs.test.ts). */
function Mark({ op }: { op: OperatorAnswer }) {
  const t = useT(ask);
  const { Icon, tone, label } = MARK[op.verdict];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {op.name}
      <Icon aria-hidden="true" strokeWidth={2.5} className={cn('size-[1em] shrink-0', tone)} />
      <VisuallyHidden>{` ${t(label)}`}</VisuallyHidden>
    </span>
  );
}

/** The block the operator was asked at, linked to OKLink, where a reader can check it. */
function Block({ block }: { block: bigint }) {
  const { lang } = useLang();
  return (
    <ExternalLink href={explorerBlock(XLAYER_EXPLORER, block)} className="font-mono tabular-nums">
      {formatCount(block, lang)}
    </ExternalLink>
  );
}

/** A Ledger row's items, a middle dot between each two. */
function Dotted({ items }: { items: (readonly [key: string, node: ReactNode])[] }) {
  return items.map(([key, node], i) => (
    <Fragment key={key}>
      {i > 0 ? ' · ' : null}
      {node}
    </Fragment>
  ));
}

/** `state 0x05 · out 0x04`: bytes from the chain only through UntrustedText. */
function Step({ answer, chain }: { answer: StepAnswer; chain: boolean }) {
  const t = useT(ask);
  const bytes = (v: string) => (chain ? <UntrustedText value={v} max={24} /> : v);
  return (
    <>
      {t('state')} {bytes(answer.next)} · {t('out')} {bytes(answer.out)}
    </>
  );
}

/**
 * The answer once X Layer answered (spec §18.4.3 Task 5′), in two rows that fit the status box AskXLayer holds. A
 * match: "X Layer agrees" and the page's answer, then the block and a mark per operator. A mismatch, in red: who
 * differs, then its raw bytes against this page's; a refusal: the block, then who refused. "Not reachable" is in
 * ask-x-layer.tsx, since it must show even when this chunk failed to load.
 */
export function AskResult({ outcome }: { outcome: AskOutcome }) {
  const t = useT(ask);
  const { block, by, got } = outcome;
  const marks = outcome.operators.map((op) => [op.origin, <Mark key={op.origin} op={op} />] as const);
  if (outcome.verdict === 'match') {
    return (
      <>
        <span data-row="said" className={cn(SAID, 'text-ink')}>
          {t(outcome.release ? 'agreeOpen' : 'agreeClosed')}
        </span>{' '}
        <span data-row="ledger" className={LEDGER}>
          <Dotted
            items={[
              ...(block === null
                ? []
                : [
                    [
                      'block',
                      <>
                        {t('block')}
                        {' '}
                        <Block block={block} />
                      </>,
                    ] as const,
                  ]),
              ...marks,
            ]}
          />
        </span>
      </>
    );
  }
  return (
    <>
      <span data-row="said" className={cn(SAID, 'text-danger')}>
        <X aria-hidden="true" strokeWidth={2.5} className="mt-[0.3em] size-[1em] shrink-0" />
        <span>
          {t(got === null ? 'refused' : 'disagree')}
          {block === null ? null : (
            <>
              {' '}
              {t('atBlock')}
              {' '}
              <Block block={block} />
            </>
          )}
        </span>
      </span>{' '}
      <span data-row="ledger" className={LEDGER}>
        {got === null ? (
          <Dotted items={marks} />
        ) : (
          <>
            {by}: <Step answer={got} chain /> / {t('thisPage')}: <Step answer={outcome.want} chain={false} />
          </>
        )}
      </span>
    </>
  );
}
