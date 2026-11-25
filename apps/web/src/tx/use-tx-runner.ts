'use client';

import type { AtropyleClient, SendResult, TxPlan } from '@atropyle/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hex, WalletClient } from 'viem';
import { useSdk } from '@/chain/hooks';
import { sameAddress } from '@/lib/address';
import { useHaptics } from '@/motion/haptics';
import type { CallsResult } from '@/wallet/impl/send-calls';
import { loadWalletImpl } from '@/wallet/load';
import { useWallet } from '@/wallet/provider';
import type { Settled, TxSender } from './impl/calls';
import { loadTxImpl, peekTxImpl, type TxImpl } from './load';
import type { MirrorCall, MirrorToken } from './mirror';
import { type ReceiptStep, receiptBase } from './receipt-view';
import { toSignHref } from './sign-href';
import { applyStep, failStep, markRows, rewind, type TxView, txView } from './tx-view';
import { useLeaveGuard } from './use-leave-guard';

/** Why `send()` would do nothing now, in the order the card asks the user to deal with them. */
export type TxBlocker = 'unsettled' | 'blocked' | 'connect' | 'wrongAccount' | 'loading';

/**
 * The wallet took something whose outcome this page has not read, so nothing may be sent again (it could pay twice):
 * a bundle it has not reported on (`base`: the plan index of its first step), or a step sent in `hash` whose receipt
 * could not be read.
 */
export type Unsettled =
  | { kind: 'bundle'; calls: CallsResult; base: number }
  | { kind: 'step'; index: number; hash: Hex };

export interface TxRunner {
  /** The plan the card shows: the page's, unless a send, an unsettled step or a receipt holds the earlier one. */
  plan: TxPlan;
  view: TxView;
  busy: boolean;
  /** The failure of the last send (decoded by the SDK), or the SDK chunk failing to load. */
  error: unknown;
  /** The last send's result, its step indices those of the plan. Every confirmed step is in `receipt`. */
  result: SendResult | null;
  /** Steps confirmed by earlier, partly failed sends; the next send starts after them. */
  offset: number;
  confirmed: number;
  /**
   * A send is in flight, the wallet accepted something for this plan, or an outcome is unsettled: the runner holds
   * the plan, and closing the tab asks first while the plan is not done.
   */
  committed: boolean;
  blocker: TxBlocker | null;
  /** The wallet is on another chain: send() asks it to switch first. */
  switchFirst: boolean;
  /**
   * `/sign/#p=…` for the steps still to send; null while sending, when done, unsettled, for a plan a simulation
   * blocks, with `handoff: false`, or above the SDK's payload limits.
   */
  handoffLink: string | null;
  explorer: string | null;
  /** How the wallet takes the steps still to send: one wallet_sendCalls bundle, or one at a time; null until known. */
  mode: 'bundle' | 'steps' | null;
  /** What each step asks the wallet, decoded from its calldata (R18.8); null until the decoder and SDK are loaded. */
  mirror: readonly MirrorCall[] | null;
  unsettled: Unsettled | null;
  /** The bundle an `unsettled` of kind bundle waits on. */
  bundle: CallsResult | null;
  rechecking: boolean;
  /** The SDK chunk failed to load: the card offers Retry (`reload`). */
  loadFailed: boolean;
  /** Every confirmed step, for the Receipt; null until the plan is done. */
  receipt: readonly ReceiptStep[] | null;
  /** The receipt's blocks and times are still being read. */
  receiptReading: boolean;
  /** The page passes a newer plan than the one the card holds. */
  stale: boolean;
  send(): void;
  /** Opens the wallet sheet; `fallback` takes focus when it closes on a connection (WalletValue.openSheet). */
  connect(fallback?: () => HTMLElement | null): void;
  /** Loads the SDK chunk again after it failed. */
  reload(): void;
  /** Reads an unsettled outcome again: the bundle's status, or the step's receipt. */
  recheck(): void;
  /** Shows the page's newer plan; does nothing while a send runs or an outcome is unsettled. */
  adopt(): void;
}

export interface TxRunnerOptions {
  plan: TxPlan;
  /** Once, after every step is confirmed, for example to refresh the vault (`useInvalidateVault`). */
  onDone?(result: SendResult): void;
  /** The page's own sender (the sign page re-inspects first); null while it loads; sendBatchOrSequential if omitted. */
  sender?: TxSender | null;
  /** false: no hand-off link (the sign page is the hand-off). */
  handoff?: boolean;
  /**
   * The assets the plan touches, for the mirror: the vault's asset list (the createVault plan's, the snapshot's, or
   * inspect's on /sign/) and the fee token the plan pays with. Matched by `to`; never inferred from chain text.
   */
  tokens?: readonly MirrorToken[];
}

/** What the runner knows about one plan. Every update names its plan, so a late report never lands on another. */
interface RunState {
  plan: TxPlan;
  view: TxView;
  error: unknown;
  result: SendResult | null;
  offset: number;
  unsettled: Unsettled | null;
  /** A bundle of this plan failed part-way: the rest goes one step at a time. */
  noBatch: boolean;
  /** The wallet refused wallet_sendCalls as unsupported. */
  fellBack: boolean;
  receipt: ReceiptStep[] | null;
}

const fresh = (plan: TxPlan): RunState => ({
  plan,
  view: txView(plan),
  error: null,
  result: null,
  offset: 0,
  unsettled: null,
  noBatch: false,
  fellBack: false,
  receipt: null,
});

/** The steps not confirmed yet: what a retry sends, and what a hand-off link may carry. */
function remaining(plan: TxPlan, offset: number): TxPlan {
  return offset === 0 ? plan : { ...plan, steps: plan.steps.slice(offset) };
}

/** A send of the steps from `base` on reports indices from 0; the card and onDone speak in the plan's. */
function rebase(r: SendResult, base: number): SendResult {
  return base === 0 ? r : { ...r, steps: r.steps.map((s) => ({ ...s, index: s.index + base })) };
}

const acceptedIn = (v: TxView) =>
  v.rows.some((r) => r.hash !== null || r.phase === 'pending' || r.phase === 'confirmed');

/**
 * Sends a prepared plan through the connected wallet (Quyết định 29, plan 7B Quyết định 2): one wallet_sendCalls
 * bundle when the wallet can, else step by step. Nothing is ever retried alone, and nothing the wallet may have
 * taken is sent again before the chain says what happened.
 */
export function useTxRunner({ plan, onDone, sender, handoff = true, tokens }: TxRunnerOptions): TxRunner {
  const sdkResult = useSdk();
  const sdk = sdkResult.data;
  const wallet = useWallet();
  const { pulse } = useHaptics();
  const [s, setS] = useState(() => fresh(plan));
  const [busy, setBusy] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [batchable, setBatchable] = useState<boolean | null>(null);
  const [impl, setImpl] = useState<TxImpl | null>(peekTxImpl);
  const inFlight = useRef(false);
  // False once the card is gone: a link in the header unmounts it without a beforeunload, and the send goes on.
  const alive = useRef(true);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // The decoder loads with the card, so a failure is described and the mirror drawn without a wait.
  useEffect(() => {
    alive.current = true;
    loadTxImpl().then(
      (m) => {
        if (alive.current) setImpl(m);
      },
      () => undefined,
    );
    return () => {
      alive.current = false;
    };
  }, []);

  // A newer plan from the page replaces the one shown, in the same render, unless something holds it: a send in
  // flight, a recheck, an unsettled outcome, steps the wallet took, or the receipt on screen (parked T13 162/168).
  const accepted = acceptedIn(s.view);
  const held = busy || rechecking || s.unsettled !== null || s.result !== null || accepted;
  if (plan !== s.plan && !held) setS(fresh(plan));

  const account = wallet.wallet?.account ?? null;
  const provider = wallet.wallet?.option.provider ?? null;
  const chainId = s.plan.chainId;

  // Whether the wallet will take a bundle, asked once per connection, so the mirror shows what the wallet will.
  useEffect(() => {
    setBatchable(null);
    if (!provider || !account) return;
    let on = true;
    loadWalletImpl()
      .then((w) => w.supportsSendCalls(provider, account, chainId))
      .then(
        (ok) => {
          if (on) setBatchable(ok);
        },
        () => {
          if (on) setBatchable(false);
        },
      );
    return () => {
      on = false;
    };
  }, [provider, account, chainId]);

  const confirmed = s.view.rows.filter((r) => r.phase === 'confirmed').length;
  const committed = busy || accepted || s.unsettled !== null;
  useLeaveGuard(committed && s.result === null);

  const blocker: TxBlocker | null =
    s.unsettled !== null
      ? 'unsettled'
      : !s.view.canSend
        ? 'blocked'
        : account === null
          ? 'connect'
          : !sameAddress(account, s.plan.from)
            ? 'wrongAccount'
            : sdk && sender !== null
              ? null
              : 'loading';

  const handoffLink = useMemo(() => {
    // A plan the card refuses to send, or may not send again yet, is not offered to another device either.
    if (
      !handoff ||
      !sdk ||
      !s.view.canSend ||
      busy ||
      s.result ||
      s.unsettled ||
      s.offset >= s.plan.steps.length ||
      typeof window === 'undefined'
    ) {
      return null;
    }
    try {
      const origin = window.location.origin;
      return toSignHref(sdk.atro.handoff.link(remaining(s.plan, s.offset), `${origin}/`), origin);
    } catch {
      return null; // above PAYLOAD_LIMITS: no hand-off for this plan
    }
  }, [handoff, sdk, s.view.canSend, busy, s.result, s.unsettled, s.plan, s.offset]);

  const mirror = useMemo(() => {
    if (!impl || !sdk) return null;
    try {
      return impl.mirrorPlan(s.plan, {
        factory: sdk.deployment.factory,
        feeTokens: sdk.deployment.feeTokens,
        tokens: tokens ?? [],
      });
    } catch {
      return null;
    }
  }, [impl, sdk, s.plan, tokens]);

  const receiptSteps = useMemo(
    () => (s.result ? receiptBase(s.plan, s.view.rows, s.result.steps) : null),
    [s.result, s.plan, s.view.rows],
  );

  // The receipt's earlier steps and block times, read once the plan is done.
  useEffect(() => {
    if (!receiptSteps || !sdk || s.receipt) return;
    const shown = s.plan;
    let on = true;
    loadTxImpl()
      .then((m) => m.readReceipt(sdk.atro, shown, receiptSteps))
      .catch(() => receiptSteps)
      .then((steps) => {
        if (on) setS((p) => (p.plan === shown ? { ...p, receipt: steps } : p));
      });
    return () => {
      on = false;
    };
  }, [receiptSteps, sdk, s.plan, s.receipt]);

  const updater = (sent: TxPlan) => (f: (p: RunState) => RunState) => setS((p) => (p.plan === sent ? f(p) : p));

  const finish = (sent: TxPlan, r: SendResult) => {
    updater(sent)((p) => ({ ...p, result: r, error: null, unsettled: null }));
    pulse();
    done.current?.(r);
  };

  const apply = (sent: TxPlan, base: number, settled: Settled) => {
    const update = updater(sent);
    if (settled.kind === 'stuck') {
      update((p) => ({ ...p, unsettled: { kind: 'bundle', calls: settled.calls, base } }));
      return;
    }
    if (settled.kind === 'confirmed') {
      const r = rebase(settled.result, base);
      update((p) => ({
        ...p,
        unsettled: null,
        view: r.steps.reduce((v, st) => applyStep(v, { index: st.index, phase: 'confirmed', hash: st.hash }), p.view),
      }));
      finish(sent, r);
      return;
    }
    const at = base + settled.confirmed;
    update((p) => {
      const ok = settled.hashes.reduce(
        (v, hash, i) => applyStep(v, { index: base + i, phase: 'confirmed', hash }),
        p.view,
      );
      const view = failStep(rewind(ok, at), at, settled.error, settled.failedHash);
      return { ...p, view, unsettled: null, offset: at, noBatch: true, error: settled.error };
    });
  };

  /** Reads the receipt of a step sent in `hash` whose receipt the send could not read. */
  const settleStep = async (m: TxImpl, atro: AtropyleClient, sent: TxPlan, index: number, hash: Hex) => {
    const c = await m.checkStep(atro, sent, index, hash);
    if (!alive.current || c.kind === 'unknown') return;
    const update = updater(sent);
    if (c.kind === 'reverted') {
      update((p) => ({ ...p, unsettled: null, error: c.error, view: failStep(p.view, index, c.error, hash) }));
      return;
    }
    update((p) => ({
      ...p,
      unsettled: null,
      error: null,
      offset: Math.max(p.offset, index + 1),
      view: applyStep(p.view, { index, phase: 'confirmed', hash }),
    }));
    if (index === sent.steps.length - 1) finish(sent, { vault: sent.vault, steps: [c.step] });
  };

  const send = () => {
    if (inFlight.current || blocker !== null || !sdk || sender === null) return;
    const from = provider;
    if (!from) return;
    inFlight.current = true;
    const sent = s.plan;
    const base = s.offset;
    const atro = sdk.atro;
    const update = updater(sent);
    // Hashes the wallet gave, by plan index: a failure after one is "sent, not known", never "failed".
    const seen = new Map<number, Hex>();
    setBusy(true);
    update((p) => ({ ...p, error: null }));
    void (async () => {
      let tx: TxImpl | null = null;
      try {
        tx = await loadTxImpl();
        const m = tx;
        if (wallet.wrongChain) await wallet.switchChain();
        const client = await wallet.walletClient();
        // No wallet prompt once the card is gone: the send stops at that step, as on a rejection. A prompt that is
        // already open still lands; the user sees it in the wallet.
        const sendTransaction = ((args) =>
          alive.current
            ? client.sendTransaction(args)
            : Promise.reject(m.pageGone())) as WalletClient['sendTransaction'];
        const part = remaining(sent, base);
        const out = await (sender ?? m.sendBatchOrSequential)(
          { atro, provider: from, walletClient: { ...client, sendTransaction } },
          part,
          {
            batch: !(s.noBatch || s.fellBack),
            live: () => alive.current,
            onBatch: () => update((p) => ({ ...p, view: markRows(p.view, base, 'signing') })),
            onFallback: () => update((p) => ({ ...p, fellBack: true, view: rewind(p.view, base) })),
            onStatus: (st) => {
              if (st === 'pending') update((p) => ({ ...p, view: markRows(p.view, base, 'pending') }));
            },
            onStep: (e) => {
              if (e.hash) seen.set(e.index + base, e.hash);
              update((p) => ({ ...p, view: applyStep(p.view, { ...e, index: e.index + base }) }));
            },
          },
        );
        if (!alive.current) return;
        if (out.kind === 'sequential') {
          finish(sent, rebase(out.result, base));
          return;
        }
        const settled = await m.settleBatch(atro, part, out.result);
        if (alive.current) apply(sent, base, settled);
      } catch (e) {
        if (!alive.current) return;
        if (!tx) {
          update((p) => ({ ...p, error: e }));
          return;
        }
        const f = tx.decodeSendFailure(e);
        const at = f.index === null ? null : f.index + base;
        const hash = at === null ? null : (f.hash ?? seen.get(at) ?? null);
        const completed = f.completed > 0 ? Math.min(base + f.completed, sent.steps.length) : base;
        update((p) => {
          // Rows the wallet showed but never took go back; a row with a hash stays sent, also when only the SDK's
          // error named the hash (no step report carried it).
          let view = rewind(p.view, base);
          if (at !== null && hash === null) view = failStep(view, at, f.error);
          if (at !== null && hash !== null) view = applyStep(view, { index: at, phase: 'pending', hash });
          return {
            ...p,
            view,
            offset: Math.max(p.offset, completed),
            error: f.error,
            unsettled: at !== null && hash !== null ? { kind: 'step', index: at, hash } : p.unsettled,
          };
        });
        if (at !== null && hash !== null) await settleStep(tx, atro, sent, at, hash);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    })();
  };

  const recheck = () => {
    const u = s.unsettled;
    if (!u || inFlight.current || !sdk) return;
    const sent = s.plan;
    const atro = sdk.atro;
    const from = provider;
    inFlight.current = true;
    setRechecking(true);
    void (async () => {
      try {
        const m = await loadTxImpl();
        if (u.kind === 'step') {
          await settleStep(m, atro, sent, u.index, u.hash);
          return;
        }
        if (!from) return;
        const w = await loadWalletImpl();
        const calls = await w.readCallsStatus(from, u.calls.id);
        if (calls.status === 'pending' || !alive.current) return;
        const settled = await m.settleBatch(atro, remaining(sent, u.base), calls);
        if (alive.current) apply(sent, u.base, settled);
      } catch {
        // Still not known: the banner stays, and so does Check again.
      } finally {
        inFlight.current = false;
        if (alive.current) setRechecking(false);
      }
    })();
  };

  const adopt = () => {
    if (inFlight.current || s.unsettled !== null || plan === s.plan) return;
    setS(fresh(plan));
  };

  return {
    plan: s.plan,
    view: s.view,
    busy,
    error: s.error ?? (sdkResult.isError ? sdkResult.error : null),
    result: s.result,
    offset: s.offset,
    confirmed,
    committed,
    blocker,
    switchFirst: account !== null && wallet.wrongChain,
    handoffLink,
    explorer: sdk?.deployment.explorerUrl ?? null,
    mode: s.noBatch || s.fellBack ? 'steps' : batchable === null ? null : batchable ? 'bundle' : 'steps',
    mirror,
    unsettled: s.unsettled,
    bundle: s.unsettled?.kind === 'bundle' ? s.unsettled.calls : null,
    rechecking,
    loadFailed: !sdk && sdkResult.isError,
    receipt: s.result ? (s.receipt ?? receiptSteps) : null,
    receiptReading: s.result !== null && s.receipt === null,
    stale: plan !== s.plan,
    send,
    connect: wallet.openSheet,
    reload: () => {
      void sdkResult.refetch();
    },
    recheck,
    adopt,
  };
}
