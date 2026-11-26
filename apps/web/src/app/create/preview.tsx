'use client';

import { ChevronUp } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { Address as Addr } from 'viem';
import { effectiveK } from '@/flows/editors/k';
import type { CreateForm } from '@/flows/impl/create-form';
import type { Loom } from '@/flows/impl/loom';
import type { WizardStep } from '@/flows/impl/wizard';
import type { FlowsImpl } from '@/flows/load';
import { sharesOf } from '@/flows/shares';
import { useLang, useT } from '@/i18n/provider';
import { isAddressText } from '@/lib/address';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { formatBps } from '@/lib/format';
import { lazyChunk, whenIdle } from '@/lib/lazy-chunk';
import { jsonStringify } from '@/lib/store';
import { roughDuration } from '@/lib/when';
import { messages } from '@/messages/create.messages';
import { messages as sign } from '@/messages/sign.messages';
import { BRANCH_BG } from '@/thread/branches';
import { courseX, drawnAxis, pctX, pctY, threadSignature, waveY } from '@/thread/geometry';
import { Thread } from '@/thread/thread';
import { Address } from '@/ui/address';
import { useLazyOverlay } from '@/ui/lazy-overlay';
import { DRILL_LIFETIME_SECONDS } from './kind';
import { CREATE_STEPS } from './progress';

export interface PreviewModel {
  form: CreateForm;
  loom: Loom;
  /** bps per heir, in order. */
  shares: number[];
  guardians: number;
  k: number;
}

/** The preview's inputs, recomputed only when the parts the Thread draws change (spec: memoised by the form hash). */
export function usePreviewModel(flows: FlowsImpl, form: CreateForm): PreviewModel {
  const guarded = form.template === 'guarded';
  const n = guarded ? form.guardians.filter((g) => g.trim() !== '').length : 0;
  const k = n > 0 ? (effectiveK(form.k, n) ?? 0) : 0;
  const hash = jsonStringify([form.drill, n, k, form.recoveryEnabled, form.timing, form.heirs.map((h) => h.percent)]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the hash of what the Thread draws
  const drawn = useMemo(
    () => ({
      loom: flows.loomOf({
        drill: form.drill,
        guardians: n,
        k,
        recoveryEnabled: form.recoveryEnabled,
        timing: form.timing,
      }),
      shares: sharesOf(form.heirs),
    }),
    [flows, hash],
  );
  return { form, loom: drawn.loom, shares: drawn.shares, guardians: n, k };
}

/** The Thread's props for a plan: a branch per heir in its own colour, dashed, the guardians at the gate. */
function threadProps(model: PreviewModel, vault: Addr | null) {
  const { loom, shares, guardians, k } = model;
  return {
    state: loom.state,
    axis: loom.axis ?? undefined,
    branches: shares.map((s) => Math.max(s, 1)),
    predicted: true,
    heirColors: true,
    posts: guardians > 0 && k > 0 ? { n: guardians, k, lit: 0 } : undefined,
    exit: loom.exit,
    signature: vault ?? undefined,
  } as const;
}

/**
 * Where the gate's foot stands, as a margin from the top of the Thread's box: a margin in percent reads the box's width,
 * and the box is `aspect`:1 (5:1 is the Thread's own, VIEW), so a y in view units is pctY(y) / aspect of the width. The
 * arch is 42 % of the box tall, or with posts at least min(3rem, 80 %) (thread.tsx), centred on the wave; then 6 px
 * of air.
 */
export function gateFoot(y: number, posts: boolean, aspect: ThreadAspect = 5): string {
  const pct = (x: number) => `${Math.round((x / aspect) * 1000) / 1000}%`;
  const half = posts ? `max(${pct(21)}, min(1.5rem, ${pct(40)}))` : pct(21);
  return `calc(${pct(pctY(y))} + ${half} + 6px)`;
}

/** The Thread's own 5:1, or 4:1 where the plan has a column of its own (the rail, the sheet): taller posts. */
export type ThreadAspect = 4 | 5;

/** The plan as the Thread draws it: an image with a name; the text list next to it says the same in words. */
export function PlanThread(p: {
  model: PreviewModel;
  vault: Addr | null;
  testId: string;
  className?: string;
  aspect?: ThreadAspect;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  const { loom, form } = p.model;
  const heirs = loom.exits?.routes.find((r) => r.route === 'heirs') ?? null;
  // A gate that waits for the guardians: without them the heirs take the later fallback, or a Drill ends first.
  const guarded = heirs !== null && heirs.guardians > 0;
  const fallback = loom.exits?.routes.find((r) => r.route === 'heirsFallback') ?? null;
  const time = loom.heirsAfter === null ? '' : durationWords(loom.heirsAfter, lang);
  // In the time machine's words: its Silent story ends on this same moment ("Heirs receive · In 15 months").
  const later = fallback ? roughDuration(fallback.after, lang) : '';
  /** A number and its unit stay on one line under the gate ("194 / ngày" reads as two things). */
  const bound = (x: string) => x.replace(/ /g, '\u00a0');
  const label =
    loom.timing === null
      ? t('previewThreadWaiting')
      : loom.heirsAfter === null
        ? t('previewThreadNone')
        : !guarded
          ? t('previewThread', { time })
          : fallback
            ? t('previewThreadGuarded', { time, fallback: later })
            : t('previewThreadGuardedOnly', { time });
  const props = threadProps(p.model, p.vault);
  const aspect = p.aspect ?? 5;
  // The gate on the drawn axis: x for the side the words stand on, the wave's y there for the gate's foot.
  const gateX = loom.axis && loom.axis.releaseAt !== null ? courseX(loom.axis.releaseAt, drawnAxis(loom.axis)) : null;
  const sig = p.vault ? threadSignature(p.vault) : null;
  return (
    <figure data-testid={p.testId} className={cn('space-y-2', p.className)}>
      {/* 6 px of air on the right: the branches' end dots never touch the card's edge. */}
      <div data-testid={`${p.testId}-box`} className="grid grid-cols-[minmax(0,1fr)] pr-1.5">
        <Thread
          {...props}
          label={label}
          // Important: the Thread's root sets its own 5:1, and cn does not merge classes.
          className={cn('w-full self-start [grid-area:1/1]', aspect === 4 && 'aspect-[4/1]!')}
        />
        {gateX !== null && loom.heirsAfter !== null ? (
          // Which route the gate is and when, at its foot at every width; the label and the list say it for a
          // screen reader. The words end under the gate (or start there, on the left half), never past the box.
          <div
            aria-hidden="true"
            data-testid={`${p.testId}-gate`}
            className={cn(
              'self-start text-caption text-ink-muted [grid-area:1/1]',
              pctX(gateX) > 50 ? 'text-right' : 'text-left',
            )}
            style={{
              marginTop: gateFoot(waveY(gateX, sig), props.posts !== undefined, aspect),
              ...(pctX(gateX) > 50
                ? { paddingRight: `max(0px, calc(${100 - pctX(gateX)}% - 2.5rem))` }
                : { paddingLeft: `max(0px, calc(${pctX(gateX)}% - 2.5rem))` }),
            }}
          >
            <p className="text-balance font-medium text-ink">
              {guarded ? t('previewGateGuarded', { time: bound(time) }) : t('previewGate', { time: bound(time) })}
            </p>
            {guarded ? (
              <p data-testid={`${p.testId}-gate-fallback`}>
                {fallback ? t('previewGateFallback', { time: bound(later) }) : t('previewGateDrillEnds')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 pt-1 text-caption text-ink-muted">
        <span>{loom.timing ? t('previewAxis', { period: durationWords(loom.timing.period, lang) }) : null}</span>
        <span
          data-testid={`${p.testId}-assets`}
          className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-caption text-ink-muted"
        >
          {form.assets.length > 0 ? t('previewAssets', { n: form.assets.length }) : t('previewNoAssets')}
        </span>
      </figcaption>
      {p.vault ? (
        <p data-testid={`${p.testId}-signed`} className="border-thread border-l-2 pl-3 text-ink text-small">
          {t('previewSigned')}
        </p>
      ) : null}
    </figure>
  );
}

/** The plan in words, part by part as its step is reached: the accessible description of the Thread. */
function PreviewList({ model, step }: { model: PreviewModel; step: WizardStep }) {
  const t = useT(messages);
  const s = useT(sign);
  const { lang } = useLang();
  const { form, shares, guardians, k, loom } = model;
  const reached = (x: WizardStep) => CREATE_STEPS.indexOf(step) >= CREATE_STEPS.indexOf(x);
  const earliest = loom.exits?.earliest ?? null;
  const item = 'space-y-2 border-line border-t pt-4';
  return (
    <ul className="space-y-4 text-ink text-small">
      <li className="font-display text-lead text-ink">
        {form.drill ? t('previewDrill', { lifetime: durationWords(DRILL_LIFETIME_SECONDS, lang) }) : t('previewReal')}
      </li>
      {reached('heirs') ? (
        <li className={item}>
          {form.heirs.map((h, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: heirs are positional
            <div key={i} className="space-y-1">
              <p className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 shrink-0 rounded-full', BRANCH_BG[i % BRANCH_BG.length])}
                />
                {t('previewHeir', { n: i + 1, share: formatBps(shares[i] ?? 0) })}
              </p>
              {isAddressText(h.account.trim()) ? (
                <Address address={h.account.trim()} size="sm" copy={false} avatar={false} className="pl-4.5" />
              ) : null}
            </div>
          ))}
        </li>
      ) : null}
      {reached('guardians') ? (
        <li className={item}>
          {guardians === 0 ? (
            <p>{t('previewNoGuardians')}</p>
          ) : (
            <p>
              {t('previewGuardians', { k, n: guardians })}
              {form.recoveryEnabled ? <span className="mt-1 block text-ink-muted">{t('previewRecovery')}</span> : null}
            </p>
          )}
        </li>
      ) : null}
      {reached('timing') && loom.exits ? (
        <li className={item}>
          <p className="text-ink-muted">{s('earliestLabel')}</p>
          <p className="font-medium">
            {earliest ? s('earliestAfter', { time: durationWords(earliest.after, lang) }) : s('earliestNone')}
          </p>
        </li>
      ) : null}
    </ul>
  );
}

export function PreviewBody(p: { model: PreviewModel; step: WizardStep; vault: Addr | null; testId: string }) {
  return (
    <div className="space-y-6">
      <PlanThread model={p.model} vault={p.vault} testId={`${p.testId}-thread`} aspect={4} />
      <PreviewList model={p.model} step={p.step} />
    </div>
  );
}

/** From lg: the right column, sticky. */
export function Preview(p: { model: PreviewModel; step: WizardStep; vault: Addr | null }) {
  const t = useT(messages);
  return (
    <aside
      data-testid="create-preview"
      aria-labelledby="create-preview-title"
      className="sticky top-24 hidden space-y-5 self-start rounded-2xl border border-line bg-surface-1 p-6 lg:block"
    >
      <h2 id="create-preview-title" className="font-medium text-caption text-ink-muted uppercase tracking-wider">
        {t('previewTitle')}
      </h2>
      <PreviewBody model={p.model} step={p.step} vault={p.vault} testId="create-preview" />
    </aside>
  );
}

/** The strip's sheet loads when the page is idle on a narrow screen, or on the first hover, focus or tap (Ruling 19). */
export const previewSheet = lazyChunk(() => import('./preview-sheet'));

/** The strip shows below lg (64rem): only there is its sheet worth warming. */
const NARROW = '(max-width: 63.99rem)';

/**
 * Below lg: a 72 px strip in the dock, the Thread small and a line of words; a tap opens the sheet. It hides while a
 * text field or a slider has focus (the dock's group, wizard.tsx), so it never covers what is being typed; a radio
 * card with focus keeps it.
 */
export function PreviewStrip(p: { model: PreviewModel; step: WizardStep; vault: Addr | null }) {
  const t = useT(messages);
  const { lang } = useLang();
  const { open, setOpen, id, anchor, trigger, content } = useLazyOverlay(previewSheet);
  useEffect(
    () =>
      whenIdle(() => {
        if (window.matchMedia(NARROW).matches) previewSheet.preload();
      }),
    [],
  );
  const { loom } = p.model;
  return (
    <div
      data-testid="create-strip"
      className={cn(
        'h-18 border-line border-b lg:hidden',
        'group-has-[input:not([type=radio]):not([type=checkbox]):focus]/create:hidden',
        'group-has-[textarea:focus]/create:hidden group-has-[select:focus]/create:hidden',
        'group-has-[[role=slider]:focus]/create:hidden',
      )}
    >
      <button
        type="button"
        data-testid="create-preview-open"
        {...trigger}
        className="flex size-full items-center gap-3 px-4 text-left aria-busy:cursor-progress"
      >
        <span aria-hidden="true" className="w-28 shrink-0">
          <Thread {...threadProps(p.model, p.vault)} className="w-full" />
        </span>
        <span className="min-w-0 grow">
          <span className="block font-medium text-ink text-small">{t('previewOpen')}</span>
          {loom.timing ? (
            <span className="block truncate text-caption text-ink-muted">
              {t('previewAxis', { period: durationWords(loom.timing.period, lang) })}
            </span>
          ) : null}
        </span>
        <ChevronUp aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
      </button>
      {content ? (
        <content.PreviewSheet
          id={id}
          anchor={anchor}
          open={open}
          onOpenChange={setOpen}
          model={p.model}
          step={p.step}
          vault={p.vault}
        />
      ) : null}
    </div>
  );
}
