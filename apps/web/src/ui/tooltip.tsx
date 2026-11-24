'use client';

import * as T from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </T.Provider>
  );
}

/** A label on hover and on keyboard focus. The trigger must be focusable (a button or a link). */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="atro-pop z-50 max-w-xs rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-caption text-ink shadow-lg"
        >
          {content}
          <T.Arrow className="fill-surface-3" width={10} height={5} />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
