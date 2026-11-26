'use client';

import { DRILL_LIFETIME_SECONDS, type EvalState, modelEngine, PRESETS, STATE_CODES } from '@atropyle/sdk';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { LazyTimeMachine } from '@/flows/time-machine/lazy';
import { TimeMachineShell } from '@/flows/time-machine/shell';
import { TimeMachine } from '@/flows/time-machine/time-machine';

/**
 * Every state of the time machine on one page, for axe, the keyboard and pointer paths and the review screenshots
 * (test/e2e/time-machine.spec.ts). The reference model computes every frame, and each preview says so; only `live`
 * reads an engine, the e2e deployment's (anvil's CPU has no netlist: the model too). A fixed "now", so the dates
 * in the shots never change.
 */
const T0 = 1_795_336_070n; // 2026-11-22 08:27:50 UTC
const DRILL_END = T0 + BigInt(DRILL_LIFETIME_SECONDS);
const OWNER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const G1: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const G2: Address = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const G3: Address = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const ENGINE = modelEngine();
/** What a time machine chunk that cannot load throws (offline, or a deploy that replaced the hashed chunks). */
const CHUNK_FAILED = new TypeError('Failed to fetch dynamically imported module');
const noop = () => {};

/** The unit fixture's guarded Drill (test/unit/fixtures.ts) moved to T0: checked in 10 s ago, k = 2 of 3. */
const DRILL: EvalState = {
  state: STATE_CODES.active,
  owner: OWNER,
  lastAlive: T0 - 10n,
  alarmAt: 0n,
  timing: PRESETS.drill,
  k: 2,
  recoveryEnabled: true,
  guardians: [G1, G2, G3],
  inhVotes: 0,
  recVotes: [null, null, null],
  recoveryTarget: null,
};
const SIX: EvalState = {
  ...DRILL,
  lastAlive: T0,
  timing: PRESETS.sixMonths,
  k: 1,
  guardians: [G1, G2],
  recVotes: [null, null],
};
const GRACE: EvalState = { ...DRILL, state: STATE_CODES.grace, lastAlive: T0 - 160n, alarmAt: T0 - 40n, inhVotes: 1 };
const ALONE: EvalState = { ...DRILL, k: 0, guardians: [], recoveryEnabled: false, recVotes: [] };
const RELEASED: EvalState = { ...DRILL, state: STATE_CODES.releasedInherit };

function Item({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div data-preview={id} className="flex min-w-0 flex-col gap-3">
      <h2 className="font-mono text-caption text-ink-muted">{title}</h2>
      {children}
    </div>
  );
}

export default function TimeMachinePreview() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
      <h1 className="font-display text-ink text-title">TimeMachine</h1>
      <Item id="drill" title="Drill · k = 2 of 3 · recovery on · model">
        <TimeMachine state={DRILL} now={T0} expiresAt={DRILL_END} drill binding={null} engine={ENGINE} />
      </Item>
      <Item id="six" title="six months · k = 1 of 2 · recovery on · model">
        <TimeMachine state={SIX} now={T0} expiresAt={null} drill={false} binding={null} engine={ENGINE} />
      </Item>
      <Item id="grace" title="Drill in grace · one confirmation of two · model">
        <TimeMachine state={GRACE} now={T0} expiresAt={DRILL_END} drill binding={null} engine={ENGINE} />
      </Item>
      <Item id="alone" title="Drill · no guardians · model">
        <TimeMachine state={ALONE} now={T0} expiresAt={DRILL_END} drill binding={null} engine={ENGINE} />
      </Item>
      <Item id="released" title="released to heirs · one frame">
        <TimeMachine state={RELEASED} now={T0} expiresAt={null} drill={false} binding={null} engine={ENGINE} />
      </Item>
      <Item id="expired" title="Drill expired · one frame">
        <TimeMachine state={DRILL} now={DRILL_END} expiresAt={DRILL_END} drill binding={null} engine={ENGINE} />
      </Item>
      <Item id="loading" title="loading · the chunk or the engine is on its way">
        <TimeMachineShell testId="time-machine" error={null} onRetry={noop} />
      </Item>
      <Item id="error" title="error · the chunk failed to load, with a Retry">
        <TimeMachineShell testId="time-machine" error={CHUNK_FAILED} onRetry={noop} />
      </Item>
      <Item id="live" title="live · the e2e deployment's engine, through LazyTimeMachine">
        <LazyTimeMachine state={DRILL} now={T0} expiresAt={DRILL_END} drill binding={null} />
      </Item>
    </div>
  );
}
