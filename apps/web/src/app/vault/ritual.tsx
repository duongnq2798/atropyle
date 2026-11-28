'use client';

import type { SendResult, VaultAction } from '@atropyle/sdk';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChainNow } from '@/chain/time';
import type { RitualDrill } from '@/flows/impl/ritual';
import { usePolicyEngine } from '@/flows/time-machine/use-engine';
import type { Params } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { formatCount } from '@/lib/count';
import { chainDate } from '@/lib/when';
import { messages } from '@/messages/owner.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import type { RevealWindowHandle } from '@/motion/reveal-window';
import { DURATION, HOLD_MS, REDUCED_MS, sec } from '@/motion/tokens';
import { threadRemaining, threadStateOf } from '@/thread/state';
import { Thread } from '@/thread/thread';
import { HoldCardShape } from '@/tx/hold-card-shape';
import type { FlowProgress } from './action-flow';
import { LazyActionFlow } from './lazy-action-flow';
import {
  dueOf,
  FACE_EDGE,
  faceRemaining,
  formatSeconds,
  type HoldState,
  IDLE_PROGRESS,
  type RitualPhase,
  ritualPhase,
} from './owner-view';
import type { PanelProps } from './vault-page';

const CHECK_IN: VaultAction = { type: 'checkIn' };

/**
 * The new knot, near the start of a full thread: the period starts again from it. A step in from the very start, since
 * the Thread clips what crosses its box: 5 % (FACE_EDGE) clears the tied knot and its ring (18 px) even on a 390 px
 * phone.
 */
const TIED_KNOT = [FACE_EDGE] as const;

/**
 * Once tied, the lit thread starts at the new knot: "now" stands on it, and the knot (Thread `tiedKnots`: solid, larger
 * than "now", drawn above it) is the focal mark, in the halo of "now".
 */
const TIED_REMAINING = 1 - TIED_KNOT[0];

/** When the wallet opened, the transaction left and the receipt came, on this machine's clock (performance.now). */
type Marks = Record<'wallet' | 'sent' | 'tied', number | null>;
const NO_MARKS: Marks = { wallet: null, sent: null, tied: null };

/** An armed hold (Enter, or a full hold) that opened no wallet rests again after this long. */
const ARMED_MS = DURATION.story * 2;

const STATUS_KEY = {
  idle: null,
  holding: 'ritualHolding',
  wallet: 'ritualWallet',
  sent: 'ritualSent',
  tied: 'ritualTiedStatus',
} as const satisfies Record<RitualPhase, keyof typeof messages.en | null>;

type T = (key: keyof typeof messages.en, params?: Params) => string;

function drillSentence(t: T, d: RitualDrill, expires: string): string {
  switch (d.kind) {
    case 'simple':
      return t('drillSimple', { a: d.a, keeper: d.keeper });
    case 'guarded':
      return t('drillGuarded', { a: d.a, b: d.b, k: d.k, n: d.n, keeper: d.keeper });
    case 'guardedOnly':
      return t('drillGuardedOnly', { a: d.a, k: d.k, n: d.n, keeper: d.keeper });
    case 'expires':
      return t('drillExpires', { date: expires });
  }
}

/**
 * Spec §18.4.2 T10 `knot-ritual`: hold to tie a knot on the vault's own thread, sign, wait for X Layer, and only with
 * the receipt is the knot tied (R18.16). The phase comes from the runner (ritualPhase), never ahead of it; the runner's
 * own 12 ms pulse marks the receipt (useTxRunner.finish), so the ritual adds none.
 */
export function Ritual({ flows, sdk, loaded, view, account, onChanged }: PanelProps) {
  const t = useT(messages);
  const { lang } = useLang();
  const calm = usePrefersReducedMotion();
  const snap = loaded.snap;
  const s = snap.status;
  const now =
    useChainNow({ blockTimestamp: s.blockTimestamp, fetchedAtMs: loaded.fetchedAtMs }, 30_000) ?? s.blockTimestamp;
  const reveal = useRef<RevealWindowHandle>(null);
  const [hold, setHold] = useState<HoldState>('off');
  const holdNow = useRef(hold);
  holdNow.current = hold;
  const [progress, setProgress] = useState<FlowProgress>(IDLE_PROGRESS);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [block, setBlock] = useState<bigint | null>(null);
  const [clock, setClock] = useState(0);
  const phase = ritualPhase(hold, progress);
  // The vault's own engine, the one its time machine reads (one query per binding): the sentence waits for it.
  const engine = usePolicyEngine(snap.binding, { enabled: view.drill }).data ?? null;
  const drill = useMemo(
    () => (view.drill && engine ? flows.ritualMinutes(snap, engine) : null),
    [flows, snap, view.drill, engine],
  );
  const due = dueOf(s);

  // Each moment once, on the client's clock: the spec times the ritual where the owner is.
  useEffect(() => {
    if (phase !== 'wallet' && phase !== 'sent' && phase !== 'tied') return;
    const at = performance.now();
    setClock(at);
    setMarks((x) => (x[phase] === null ? { ...x, [phase]: at } : x));
  }, [phase]);

  // "Waiting for X Layer · 0.8 s": a tenth of a second at a time, only while it waits.
  useEffect(() => {
    if (phase !== 'sent') return;
    const id = setInterval(() => setClock(performance.now()), 100);
    return () => clearInterval(id);
  }, [phase]);

  // The runner took over, or an armed hold opened nothing (a refused send): the hold is over.
  useEffect(() => {
    if (hold === 'off') return;
    if (progress.busy || progress.committed || progress.finished) {
      setHold('off');
      return;
    }
    if (hold !== 'armed') return;
    const id = setTimeout(() => setHold('off'), ARMED_MS);
    return () => clearTimeout(id);
  }, [hold, progress]);

  // Back at rest (a release, a rejection in the wallet, Start over): the thread shows the vault's time again.
  useEffect(() => {
    if (phase === 'idle') reveal.current?.reset();
  }, [phase]);

  // A tab put away mid-hold comes back at rest; one that comes back while waiting shows the time that passed. Every
  // other phase is the runner's, so it is still right on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (holdNow.current !== 'on') return;
        setHold('off');
        reveal.current?.reset('instant');
      } else {
        setClock(performance.now());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const onHoldStart = useCallback(() => {
    setHold('on');
    // The thread recharges over the hold, straight (motion-safe only), up to where the new knot will tie; an early
    // release springs it back.
    if (!calm) reveal.current?.setRange(FACE_EDGE * 100, 100, { linear: HOLD_MS });
  }, [calm]);

  const onHoldEnd = useCallback((confirmed: boolean) => {
    setHold(confirmed ? 'armed' : 'off');
    if (!confirmed) reveal.current?.reset();
  }, []);

  const onDone = useCallback(
    (r: SendResult) => {
      setBlock(r.steps.at(-1)?.blockNumber ?? null);
      onChanged(r);
    },
    [onChanged],
  );

  const onReset = useCallback(() => {
    setHold('off');
    setProgress(IDLE_PROGRESS);
    setMarks(NO_MARKS);
    setBlock(null);
  }, []);

  const tied = phase === 'tied';
  // From the wallet on, the check-in restarts the period: "now" and the hollow pending knot stand where the solid knot
  // will tie (TIED_KNOT, 5 %), so the knot fills in place and is never clipped at the Thread's edge. Without an axis
  // the geometry draws "now" only while remaining > 0 (geometry.ts), and an owner checking in late has 0 left:
  // threadRemaining would draw no pending knot. A hold keeps the old props, so the reveal window's recharge
  // (setRange) is not cut by a prop change.
  const restarting = phase === 'wallet' || phase === 'sent' || tied;
  // Keyed on `tied`: the solid knot comes in a fade (REDUCED_MS under reduced motion), in place of the hollow one. A
  // span: until the receipt it is the face of the hold, inside the button (HoldButton `face`); then the face of the
  // hold's end, in the same box at the same place (TxCard `holdPlacement="top"`, HoldEnd).
  const face = (
    <m.span
      key={tied ? 'tied' : 'open'}
      data-testid="owner-ritual-face"
      data-ritual={phase}
      initial={tied ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: sec(calm ? REDUCED_MS : DURATION.base) }}
      className="block w-full"
    >
      <Thread
        state={tied ? 'active' : threadStateOf(s)}
        remaining={restarting ? TIED_REMAINING : faceRemaining(threadRemaining(s, now))}
        knots={tied ? TIED_KNOT : undefined}
        tiedKnots={tied}
        pendingKnot={phase === 'wallet' || phase === 'sent'}
        signature={view.vault}
        revealRef={reveal}
        className="h-12 w-full sm:h-16"
      />
    </m.span>
  );

  // Grouped in the reader's way, as the Receipt's Block line above it ("1,234,567", "1.234.567"); data-block stays raw.
  const blockText = block === null ? '' : formatCount(block, lang);
  const since = marks.sent ?? marks.wallet;
  const elapsed = (to: number | null) => formatSeconds(to !== null && since !== null ? to - since : 0, lang);
  // TxCard draws the HoldButton until runner.result, then, the hold being up front, the hold's end in its place: the
  // same face (hold.face) in the same box, and this line where the bar stood, before the Receipt's rows. The knot fills
  // where it waited and the line says it in sight, the climax never under the ledger and the hash.
  const footer =
    block !== null ? (
      // A span: it runs on from the check in front of it, in the hold's end (HoldEnd), which balances the lines.
      <span data-testid="owner-tied" data-block={String(block)} className="voice-ledger text-body text-ink">
        {t('ritualTied', { block: blockText, seconds: elapsed(marks.tied) })}
      </span>
    ) : null;
  const key = STATUS_KEY[phase];
  const date = (ts: bigint) => chainDate(ts, lang, view.drill);
  // The bar names each busy phase itself (TxCard `busyLabel`), never "Sending…" while the wallet asks: "Now sign in
  // your wallet", then "Waiting for X Layer". The line under the hold says only what the bar does not: how to hold,
  // what to check before signing, then the wait's seconds. The status line below says each phase to a screen reader,
  // so the seconds are for the eye only (aria-hidden): the ticking is never read out.
  const busyLabel = phase === 'sent' ? t('ritualSent') : t('ritualSign');
  const hint =
    phase === 'sent' ? (
      <span aria-hidden className="voice-ledger tabular-nums">
        {elapsed(clock)}
      </span>
    ) : phase === 'wallet' ? (
      t('ritualSignHint')
    ) : (
      t('ritualHint')
    );

  return (
    <div data-testid="owner-ritual" data-ritual={phase} className="flex flex-col gap-4">
      <p className="text-body text-ink-muted">{t('ritualLead')}</p>
      {due ? (
        <p data-testid="owner-due" data-kind={due.kind} className="text-body text-ink">
          {t(due.kind, { date: due.at === null ? '' : date(due.at) })}
        </p>
      ) : null}
      {drill ? (
        <p data-testid="owner-drill" data-kind={drill.kind} className="text-small text-ink-muted">
          {drillSentence(t, drill, s.expiresAt === null ? '' : date(s.expiresAt))}
        </p>
      ) : null}
      <LazyActionFlow
        flows={flows}
        sdk={sdk}
        vault={view.vault}
        drill={view.drill}
        action={CHECK_IN}
        as={account}
        label={t('checkIn')}
        title={t('ritualTxTitle')}
        nested
        testId="owner-checkin"
        confirm="hold"
        // The ritual is the card's first thing, straight under its heading: the thread on the button's face, then
        // what the wallet should show (spec §4.6.3 "one big button").
        holdPlacement="top"
        auto
        hold={{
          hint,
          // Once held, before the wallet opens, the bar still says "Check in": the line says where to sign. From the
          // wallet on, the bar says it, and the line keeps its own words.
          doneLabel: phase === 'sent' || phase === 'wallet' ? hint : t('ritualSign'),
          busyLabel,
          showKnot: false,
          face,
          onHoldStart,
          onHoldEnd,
        }}
        receiptFooter={footer}
        // While the check-in prepares, its card and its hold already stand where they will, the face on it: when the
        // plan lands, only the step and what the wallet should show come in under the hold.
        preparing={<HoldCardShape title={t('ritualTxTitle')} nested face={face} hint={hint} />}
        onProgress={setProgress}
        onDone={onDone}
        onReset={onReset}
        // Nothing to start over at rest (the check-in is prepared at once); from the wallet on, a stuck prompt or a
        // tied knot starts again from here.
        resettable={restarting}
        // Once tied, the last words invite the next check-in; a stuck wallet or wait still starts over.
        resetLabel={tied ? t('ritualAgain') : undefined}
      />
      {/* Every phase for a screen reader: the eye reads the same in the hold's hint, then in the hold's end. */}
      <p data-testid="owner-ritual-status" role="status" className="sr-only">
        {key ? t(key, { block: blockText }) : null}
      </p>
    </div>
  );
}
