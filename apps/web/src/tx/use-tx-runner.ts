'use client';

import type { SendResult, TxPlan } from '@atropyle/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WalletClient } from 'viem';
import { useSdk } from '@/chain/hooks';
import { sameAddress } from '@/lib/address';
import { useHaptics } from '@/motion/haptics';
import { useWallet } from '@/wallet/provider';
import { loadTxImpl, type TxImpl } from './load';
import { toSignHref } from './sign-href';
import { applyStep, failStep, type TxView, txView } from './tx-view';
import { useLeaveGuard } from './use-leave-guard';

/** Why `send()` would do nothing now, in the order the card asks the user to fix them. */
export type TxBlocker = 'blocked' | 'connect' | 'wrongAccount' | 'loading';

export interface TxRunner {
  plan: TxPlan;
  view: TxView;
  busy: boolean;
  /** The failure of the last send (decoded by the SDK), or the SDK chunk failing to load. */
  error: unknown;
  result: SendResult | null;
  /** Steps confirmed by earlier, partly failed sends; the next send starts after them. */
  offset: number;
  confirmed: number;
  /**
   * A send is in flight, or the wallet accepted something for this plan (a hash, a pending or confirmed step). The
   * page must not swap the plan, and closing the tab asks first.
   */
  committed: boolean;
  blocker: TxBlocker | null;
  /** The wallet is on another chain: send() asks it to switch first. */
  switchFirst: boolean;
  /**
   * `/sign/#p=…` for the steps still to send; null while sending, when done, for a plan a simulation blocks, or above
   * the SDK's payload limits.
   */
  handoffLink: string | null;
  explorer: string | null;
  send(): void;
  /** Opens the wallet sheet; `fallback` takes focus when it closes on a connection (WalletValue.openSheet). */
  connect(fallback?: () => HTMLElement | null): void;
  /** Loads the SDK chunk again after it failed. */
  reload(): void;
}

export interface TxRunnerOptions {
  plan: TxPlan;
  /** After every step is confirmed, for example to refresh the vault (`useInvalidateVault`). */
  onDone?(result: SendResult): void;
}

/** The steps not confirmed yet: what a retry sends, and what a hand-off link may carry. */
function remaining(plan: TxPlan, offset: number): TxPlan {
  return offset === 0 ? plan : { ...plan, steps: plan.steps.slice(offset) };
}

/** Sends a prepared plan step by step through the connected wallet (Quyết định 29). Nothing is ever retried alone. */
export function useTxRunner({ plan, onDone }: TxRunnerOptions): TxRunner {
  const sdkResult = useSdk();
  const sdk = sdkResult.data;
  const wallet = useWallet();
  const { pulse } = useHaptics();
  const [shown, setShown] = useState(plan);
  const [view, setView] = useState(() => txView(plan));
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  // Steps already confirmed on chain by an earlier, partly failed send; a retry never signs them again.
  const [offset, setOffset] = useState(0);
  const inFlight = useRef(false);
  const live = useRef(plan);
  // False once the card is gone: a link in the header unmounts it without a beforeunload, and the send goes on.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A different plan starts clean, in the same render (no frame shows the old rows under the new plan).
  if (shown !== plan) {
    setShown(plan);
    setView(txView(plan));
    setSendError(null);
    setResult(null);
    setOffset(0);
  }

  useEffect(() => {
    live.current = plan;
  }, [plan]);

  // The send-failure decoder loads with the card, so a failure is described without a wait.
  useEffect(() => {
    loadTxImpl().catch(() => undefined);
  }, []);

  const confirmed = view.rows.filter((r) => r.phase === 'confirmed').length;
  // A failed row keeps the hash it got, so a failure after `pending` stays accepted; a rejection before any hash does not.
  const accepted = view.rows.some((r) => r.hash !== null || r.phase === 'pending' || r.phase === 'confirmed');
  const committed = busy || accepted;
  useLeaveGuard(committed && result === null);

  const account = wallet.wallet?.account ?? null;
  const blocker: TxBlocker | null = !view.canSend
    ? 'blocked'
    : account === null
      ? 'connect'
      : !sameAddress(account, plan.from)
        ? 'wrongAccount'
        : sdk
          ? null
          : 'loading';

  const handoffLink = useMemo(() => {
    // A plan the card refuses to send is not offered to another device either.
    if (!sdk || !view.canSend || busy || result || offset >= plan.steps.length || typeof window === 'undefined') {
      return null;
    }
    try {
      const origin = window.location.origin;
      return toSignHref(sdk.atro.handoff.link(remaining(plan, offset), `${origin}/`), origin);
    } catch {
      return null; // above PAYLOAD_LIMITS: no hand-off for this plan
    }
  }, [sdk, view.canSend, busy, result, plan, offset]);

  const send = () => {
    if (inFlight.current || blocker !== null || !sdk) return;
    inFlight.current = true;
    const sent = plan;
    const base = offset;
    setBusy(true);
    setSendError(null);
    void (async () => {
      let tx: TxImpl | null = null;
      try {
        tx = await loadTxImpl();
        if (wallet.wrongChain) await wallet.switchChain();
        const client = await wallet.walletClient();
        const impl = tx;
        // No wallet prompt for a plan the page no longer shows (unmounted, or swapped): the send stops at that step,
        // as on a rejection. A prompt that is already open still lands; the user sees it in the wallet.
        const sendTransaction = ((args) =>
          alive.current && live.current === sent
            ? client.sendTransaction(args)
            : Promise.reject(impl.pageGone())) as WalletClient['sendTransaction'];
        const r = await sdk.atro.send(
          remaining(sent, base),
          { ...client, sendTransaction },
          {
            onStep: (e) => {
              if (live.current === sent) setView((v) => applyStep(v, { ...e, index: e.index + base }));
            },
          },
        );
        if (live.current !== sent) return;
        setResult(r);
        pulse();
        onDone?.(r);
      } catch (e) {
        if (live.current !== sent) return;
        if (!tx) {
          setSendError(e);
          return;
        }
        const f = tx.decodeSendFailure(e);
        const at = f.index;
        if (at !== null) setView((v) => failStep(v, at + base, f.error));
        if (f.completed > 0) setOffset(Math.min(base + f.completed, sent.steps.length));
        setSendError(f.error);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    })();
  };

  return {
    plan,
    view,
    busy,
    error: sendError ?? (sdkResult.isError ? sdkResult.error : null),
    result,
    offset,
    confirmed,
    committed,
    blocker,
    switchFirst: account !== null && wallet.wrongChain,
    handoffLink,
    explorer: sdk?.deployment.explorerUrl ?? null,
    send,
    connect: wallet.openSheet,
    reload: () => {
      void sdkResult.refetch();
    },
  };
}
