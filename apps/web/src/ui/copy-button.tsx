'use client';

import { Check, Copy } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { messages as ui } from '@/messages/ui.messages';
import { SPRING } from '@/motion/tokens';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({
  text,
  label,
  showText = false,
  className,
}: {
  text: string;
  /** The accessible name, for example "Copy address". */
  label: string;
  showText?: boolean;
  className?: string;
}) {
  const c = useT(common);
  const t = useT(ui);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 1600);
    return () => clearTimeout(id);
  }, [state]);

  const Icon = state === 'copied' ? Check : Copy;
  return (
    <>
      <button
        type="button"
        aria-label={showText ? undefined : label}
        onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full text-ink-muted transition-colors duration-150 hover:text-ink',
          showText ? 'h-8 px-3 text-small hover:bg-surface-2' : 'size-8 justify-center hover:bg-surface-2',
          state === 'copied' && 'text-alive hover:text-alive',
          className,
        )}
      >
        <m.span
          key={state}
          className="inline-flex"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
        </m.span>
        {showText ? <span>{state === 'copied' ? c('copied') : label}</span> : null}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? c('copied') : state === 'failed' ? t('copyFailed') : ''}
      </span>
    </>
  );
}
