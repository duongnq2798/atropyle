'use client';

import { cn } from '@/lib/cn';
import { CopyButton } from './copy-button';

/** A shell command in mono, wrapped at any character so a 390 px screen never scrolls sideways, with its copy button. */
export function CommandLine({ command, label, className }: { command: string; label: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-xl border border-line bg-surface-2 py-2 pr-2 pl-3', className)}>
      <code translate="no" className="min-w-0 flex-1 whitespace-pre-wrap py-1 font-mono text-small wrap-anywhere">
        {command}
      </code>
      <CopyButton text={command} label={label} />
    </div>
  );
}
