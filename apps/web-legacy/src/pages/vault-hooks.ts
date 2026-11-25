import { type Timeline, timelineOf, type VaultSnapshot } from '@atropyle/sdk';
import { useEffect, useState } from 'preact/hooks';
import type { Address } from 'viem';
import type { Sdk } from '../lib/sdk';

export interface Loaded {
  snap: VaultSnapshot;
  timeline: Timeline;
  /** The deployment's factory created this vault, at the snapshot's block. Its own `factory()` proves nothing. */
  registered: boolean;
  fetchedAtMs: number;
}

async function loadVault(sdk: Sdk, vault: Address): Promise<Loaded> {
  const handle = sdk.atro.vault(vault);
  const snap = await handle.snapshot();
  const [registered, engine] = await Promise.all([
    handle.registered({ blockNumber: snap.status.blockNumber }),
    sdk.atro.engineFor(snap.binding.cpu, snap.binding.policyId),
  ]);
  return { snap, timeline: timelineOf(engine, snap), registered, fetchedAtMs: Date.now() };
}

/** Keeps the last good snapshot on screen while it refreshes, so a finished transaction stays visible. */
export function useVault(sdk: Sdk, vault: Address) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(true);
  // `tick` is a trigger: bumping it re-runs the load below.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    loadVault(sdk, vault).then(
      (d) => {
        if (!live) return;
        setData(d);
        setError(null);
        setBusy(false);
      },
      (e: unknown) => {
        if (!live) return;
        setError(e);
        setBusy(false);
      },
    );
    return () => {
      live = false;
    };
  }, [sdk, vault, tick]);
  return { data, error, busy, reload: () => setTick((x) => x + 1) };
}

export function useNowMs(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
