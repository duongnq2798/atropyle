'use client';

import { type ReactNode, useId } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/action-runner.messages';
import { FACE_BOX, HOLD_HINT, OBJECT, OBJECT_BAR, OBJECT_BUTTON, OBJECT_COLUMN } from '@/ui/hold-object';
import { TX_ACTION_TOP, TX_CARD, TX_HEADER, txHeading, txSendArea } from './card-shape';

/** What a flow says about its card that the silhouette needs (ActionFlowProps). */
interface Shaped {
  confirm?: 'click' | 'hold';
  holdPlacement?: 'end' | 'top';
  title?: ReactNode;
  hold?: { face?: ReactNode };
}

/** A flow whose card stands its hold first, with a face and a heading of its own (the check-in ritual). */
export function holdShaped(p: Shaped): boolean {
  return p.confirm === 'hold' && p.holdPlacement === 'top' && p.title !== undefined && p.hold?.face !== undefined;
}

export interface HoldCardShapeProps {
  title: ReactNode;
  nested?: boolean;
  tone?: 'thread' | 'danger';
  /** The hold's face, as the page builds it: the check-in ritual's thread, already on the page. */
  face: ReactNode;
  hint?: ReactNode;
}

/**
 * The card a hold up front will stand on (TxCard `holdPlacement="top"`), while its plan is prepared (spec §6: a
 * skeleton in the real content's shape; §18.2.6: the first paint is the final layout). TxCard's own boxes and the
 * hold's (card-shape.ts, hold-object.ts), down to the hold, with the page's face on it and its bar disabled, saying
 * "Preparing…", as TxCard's hold says it while the wallet mirror loads: when the plan lands, the hold does not move,
 * and only the steps and what the wallet should show come in under it. Static: nothing to press, no motion.
 */
export function HoldCardShape({ title, nested = false, tone = 'thread', face, hint }: HoldCardShapeProps) {
  const t = useT(messages);
  const headingId = useId();
  const o = OBJECT[tone];
  return (
    <section aria-labelledby={headingId} className={TX_CARD}>
      <header className={TX_HEADER}>
        <h3 id={headingId} className={txHeading(nested)}>
          {title}
        </h3>
      </header>
      <div className={TX_ACTION_TOP}>
        <div className={txSendArea(true)}>
          <span className={OBJECT_COLUMN}>
            <button type="button" disabled className={cn(OBJECT_BUTTON, o.frame)}>
              <span data-part="face" className={FACE_BOX}>
                {face}
              </span>
              <span data-part="bar" className={cn(OBJECT_BAR, o.bar)}>
                <span>{t('preparing')}</span>
              </span>
            </button>
            <span className={HOLD_HINT}>{hint}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
