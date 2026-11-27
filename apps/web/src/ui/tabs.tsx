'use client';

import * as T from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange(value: string): void;
  /** Names the tab list for screen readers. */
  label: string;
  testId: string;
  className?: string;
}

/**
 * Radix Tabs: arrow keys move between tabs, Tab moves into the panel. Every panel stays mounted (forceMount; an
 * inactive one is display:none through its data-state), so a transaction in progress in one tab survives a look at
 * another.
 */
export function Tabs({ items, value, onValueChange, label, testId, className }: TabsProps) {
  return (
    <T.Root
      value={value}
      onValueChange={onValueChange}
      data-testid={testId}
      className={cn('flex flex-col gap-6', className)}
    >
      <T.List aria-label={label} className="flex gap-1 overflow-x-auto border-line border-b">
        {items.map((it) => (
          <T.Trigger
            key={it.value}
            value={it.value}
            data-testid={`${testId}-tab-${it.value}`}
            className="-mb-px min-h-11 shrink-0 border-transparent border-b-2 px-4 text-body text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-thread data-[state=active]:border-thread data-[state=active]:text-ink"
          >
            {it.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((it) => (
        <T.Content
          key={it.value}
          value={it.value}
          forceMount
          data-testid={`${testId}-panel-${it.value}`}
          className="focus-visible:outline-2 focus-visible:outline-thread data-[state=inactive]:hidden"
        >
          {it.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
