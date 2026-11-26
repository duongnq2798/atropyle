import { Check, Minus, X } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ask } from '@/messages/ask.messages';
import { UntrustedText } from '@/ui/untrusted-text';
import { VisuallyHidden } from '@/ui/visually-hidden';
import type { AskOutcome, OperatorAnswer } from './ask';

export { askXLayer } from './ask';

const ICON = 'ml-[0.25ch] inline-block size-[1em] align-[-0.125em]';
const MARK = {
  same: { Icon: Check, tone: 'text-alive', label: 'opSame' },
  different: { Icon: X, tone: 'text-danger', label: 'opDifferent' },
  reverted: { Icon: X, tone: 'text-danger', label: 'opDifferent' },
  unreachable: { Icon: Minus, tone: 'text-ink-muted', label: 'opNone' },
} as const;

/** One operator and how it answered, as an icon with a hidden word: "OKX ✓" without a ✓ character (glyphs.test.ts). */
function Mark({ op }: { op: OperatorAnswer }) {
  const t = useT(ask);
  const { Icon, tone, label } = MARK[op.verdict];
  return (
    <span className="whitespace-nowrap">
      {op.name}
      <Icon aria-hidden="true" strokeWidth={2.5} className={cn(ICON, tone)} />
      <VisuallyHidden>{t(label)}</VisuallyHidden>
    </span>
  );
}

/**
 * The sentence once X Layer answered (spec §18.4.3 Task 5′): the same answer as this page, with a mark per operator;
 * or, in red, the processor's raw `newState/outputs` against this page's. "Not reachable" is in ask-x-layer.tsx,
 * since it must show even when this chunk failed to load.
 */
export function AskResult({ outcome }: { outcome: AskOutcome }) {
  const t = useT(ask);
  const block = outcome.block?.toString() ?? '';
  const marks = (
    <span className="inline-flex flex-wrap gap-x-3">
      {outcome.operators.map((op) => (
        <Mark key={op.origin} op={op} />
      ))}
    </span>
  );
  if (outcome.verdict === 'match') {
    return (
      <span className="text-ink">
        {t(outcome.release ? 'matchOpen' : 'matchClosed', { block })} {marks}
      </span>
    );
  }
  return (
    <span className="text-danger">
      {outcome.got === null ? (
        t('reverted', { block })
      ) : (
        <>
          {t('mismatch', { block })}{' '}
          <code className="font-mono">
            <UntrustedText value={outcome.got} max={24} />
          </code>
          ; {t('mismatchPage')} <code className="font-mono">{outcome.want}</code>.
        </>
      )}{' '}
      {marks}
    </span>
  );
}
