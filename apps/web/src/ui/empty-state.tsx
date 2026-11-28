'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { StateGlyph } from '@/thread/glyphs';

export function EmptyState({
  title,
  body,
  action,
  icon,
  as: Title = 'p',
  testId,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  /** The title's element: a heading where the card stands for a section of the page (7A parked item, 7C T8). */
  as?: 'p' | 'h2' | 'h3';
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-col items-center gap-3 rounded-3xl border border-line border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-thread">
        {icon ?? <StateGlyph name="knot" size={24} />}
      </span>
      <Title className="font-display text-title text-ink">{title}</Title>
      {body ? <p className="max-w-prose text-ink-muted text-small">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
