'use client';

import { Check, Copy, X } from 'lucide-react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { messages as ui } from '@/messages/ui.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { EASE_OUT_EXPO, REDUCED_MS, SPRING, sec } from '@/motion/tokens';

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
  const calm = usePrefersReducedMotion();
  // `n` counts the copies: a second copy within the reset time enters again and restarts the reset.
  const [{ state, n }, setCopy] = useState<{ state: CopyState; n: number }>({ state: 'idle', n: 0 });
  // Only a change enters: the first icon is there from the first paint, also without JS (§18.2, 6).
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);

  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setCopy({ state: 'idle', n }), 1600);
    return () => clearTimeout(id);
  }, [state, n]);

  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Copy;
  const said = state === 'copied' ? c('copied') : state === 'failed' ? t('copyFailed') : '';
  return (
    <>
      <button
        type="button"
        aria-label={showText ? undefined : label}
        onClick={async () => {
          const ok = await copyText(text);
          setCopy((s) => ({ state: ok ? 'copied' : 'failed', n: s.n + 1 }));
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full text-ink-muted transition-colors duration-150 hover:text-ink',
          showText ? 'h-8 px-3 text-small hover:bg-surface-2' : 'size-8 justify-center hover:bg-surface-2',
          state === 'copied' && 'text-alive hover:text-alive',
          state === 'failed' && 'text-danger hover:text-danger',
          className,
        )}
      >
        <m.span
          key={`${state}-${n}`}
          className="inline-flex"
          initial={settled.current ? (calm ? { opacity: 0 } : { scale: 0.6, opacity: 0 }) : false}
          animate={{ scale: 1, opacity: 1 }}
          // Under reduced motion a crossfade of REDUCED_MS (spec §4.4): motion would drop only the scale.
          transition={calm ? { duration: sec(REDUCED_MS), ease: EASE_OUT_EXPO } : SPRING}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
        </m.span>
        {showText ? <span>{said || label}</span> : null}
      </button>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
  );
}
