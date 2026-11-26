'use client';

import { RadioTower } from 'lucide-react';
import { useState } from 'react';
import { useChainSettings } from '@/chain/provider';
import { chainIdOf, ENV } from '@/config/env';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { lazyChunk } from '@/lib/lazy-chunk';
import { useMounted } from '@/lib/use-mounted';
import { messages as home } from '@/messages/home.messages';
import { Button } from '@/ui/button';
import type { HeroCase } from './hero-cases';
import type { AskOutcome } from './impl/ask';

/**
 * R18.19: only a build that reads X Layer mainnet through the SDK's own deployment asks its processor. A devnet
 * build (the e2e one) has no netlist on its CPU and would show a false answer, and a custom NEXT_PUBLIC_DEPLOYMENT
 * may list RPCs other than ask-calls.ts, which its CSP would block (ruling R6).
 */
export const ASKABLE: boolean = chainIdOf(ENV) === 196 && ENV.deploymentJson === null;

/**
 * The calls, the decoder and the result sentence: loaded on intent, never with the page (R18.18, first-load.test).
 * Exported as the shell's chunks are (connectSheet), so ask-x-layer.test.tsx can tell focus and a press apart (R34).
 */
export const askChunk = lazyChunk(() => import('./impl/ask-view'));

type Phase = { kind: 'idle' } | { kind: 'asking' } | { kind: 'done'; outcome: AskOutcome } | { kind: 'failed' };

/**
 * "Ask X Layer" for the hero's checked question. AskCircuit remounts it on every chip change (key), so an answer
 * never stays under the wrong question. Prerendered invisible and shown on mount in the same box: no layout shift,
 * and no button that cannot work without JavaScript (ruling R19).
 */
export function AskXLayer({ choice }: { choice: HeroCase }) {
  const t = useT(home);
  const mounted = useMounted();
  const { crossCheck } = useChainSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const view = askChunk.peek();
  const ask = async () => {
    if (phase.kind === 'asking') return;
    setPhase({ kind: 'asking' });
    try {
      const mod = await askChunk.load();
      setPhase({ kind: 'done', outcome: await mod.askXLayer(choice, { target: ENV.target, crossCheck }) });
    } catch {
      setPhase({ kind: 'failed' });
    }
  };
  const unreachable = phase.kind === 'failed' || (phase.kind === 'done' && phase.outcome.verdict === 'unreachable');
  return (
    <div
      data-testid="ask-x-layer"
      data-phase={phase.kind}
      data-verdict={phase.kind === 'done' ? phase.outcome.verdict : undefined}
      className={cn('flex flex-col items-start gap-3', !mounted && 'invisible')}
    >
      {/* The icon tells the action from the three chips above it, which share its pill shape. */}
      <Button
        variant="secondary"
        icon={<RadioTower aria-hidden="true" strokeWidth={1.5} />}
        loading={phase.kind === 'asking'}
        loadingLabel={t('askBusy')}
        onClick={ask}
        onPointerEnter={askChunk.preload}
        onFocus={askChunk.preload}
      >
        {t('askButton')}
      </Button>
      {/* Held for the answer: a body line and two small ones on a phone, a body line and a small one from 40rem. The
          answer (two rows, impl/ask-view.tsx) replaces the hint without moving the page. */}
      <p
        role="status"
        className="min-h-[calc(2lh_+_var(--text-body)*var(--text-body--line-height))] text-pretty text-small sm:min-h-[calc(1lh_+_var(--text-body)*var(--text-body--line-height))]"
      >
        {unreachable ? (
          <span className="text-ink-muted">{t('askUnreachable')}</span>
        ) : phase.kind === 'done' && view ? (
          <view.AskResult outcome={phase.outcome} />
        ) : (
          <span className="text-ink-muted">{t('askHint')}</span>
        )}
      </p>
    </div>
  );
}
