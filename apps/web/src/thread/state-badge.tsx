'use client';

import { m } from 'motion/react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, sec } from '@/motion/tokens';
import { StateGlyph } from './glyphs';
import { BADGE_COLOR, STATE_GLYPH, type ThreadState } from './state';

export interface StateBadgeProps {
  state: ThreadState;
  /** Adds a "Drill" chip. */
  drill?: boolean;
  size?: 'sm' | 'md';
  /** Announce state changes politely (the vault page, where the state can change while the user reads). */
  live?: boolean;
  className?: string;
}

/** The vault state in words, glyph and colour; the glyph and words alone are enough (spec §4.1). */
export function StateBadge({ state, drill = false, size = 'md', live = false, className }: StateBadgeProps) {
  const t = useT(labels);
  const calm = usePrefersReducedMotion();
  return (
    <span
      data-state={state}
      aria-live={live ? 'polite' : undefined}
      aria-atomic={live ? true : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'h-6 px-2 text-caption' : 'h-8 px-3 text-small',
        BADGE_COLOR[state],
        className,
      )}
    >
      <m.span
        key={state}
        className="inline-flex items-center gap-1.5"
        initial={calm ? { opacity: 0 } : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: sec(calm ? 120 : DURATION.base), ease: EASE_OUT_EXPO }}
      >
        <StateGlyph name={STATE_GLYPH[state]} size={size === 'sm' ? 14 : 16} />
        <span>{t(THREAD_STATE_KEY[state])}</span>
      </m.span>
      {drill ? (
        <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 text-caption text-ink-muted">
          <StateGlyph name="drill" size={12} />
          {t('drill')}
        </span>
      ) : null}
    </span>
  );
}
