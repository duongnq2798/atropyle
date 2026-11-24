'use client';

import * as T from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

const DELAY = { delayDuration: 350, skipDelayDuration: 150 } as const;

/**
 * A label on hover and on keyboard focus. The trigger must be focusable (a button or a link). Each tooltip has its
 * own provider, so no provider wraps the app and the pages without a tooltip, `/` among them, load none of this
 * (ruling R23). The cost: moving straight from one tooltip to the next waits the full delay again.
 */
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
    <T.Provider {...DELAY}>
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
    </T.Provider>
  );
}
