import type { SendResult } from '@atropyle/sdk';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionFlowProps } from '../../src/app/vault/action-flow';
import { Ritual } from '../../src/app/vault/ritual';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { HOLD_MS } from '../../src/motion/tokens';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

const flow = vi.hoisted(() => ({ last: new Map<string, unknown>(), done: new Set<string>() }));
const spies = vi.hoisted(() => ({ setRange: vi.fn(), reset: vi.fn(), pulse: vi.fn() }));
// The signing UI is not under test: a stand-in that keeps its props and draws what TxCard draws: the hold (with its
// face) until the receipt; then, with holdPlacement="top", the hold's end in its place (HoldEnd: the face, the footer
// where the bar stood) before the Receipt, else the Receipt with its footer.
vi.mock('../../src/app/vault/lazy-action-flow', () => ({
  actionFlowChunk: { preload: () => {}, peek: () => null, load: async () => ({}) },
  LazyActionFlow: (p: ActionFlowProps) => {
    flow.last.set(p.testId, p);
    return (
      <div>
        <button type="button" data-testid={p.testId} data-auto={String(p.auto ?? false)}>
          {p.label}
        </button>
        {flow.done.has(p.testId) ? (
          p.holdPlacement === 'top' ? (
            <>
              <div data-testid={`${p.testId}-tx-end`}>
                {p.hold?.face ?? null}
                <div data-testid={`${p.testId}-tx-end-band`}>{p.receiptFooter}</div>
              </div>
              <div data-testid={`${p.testId}-tx-done`} />
            </>
          ) : (
            <div data-testid={`${p.testId}-tx-done`}>{p.receiptFooter}</div>
          )
        ) : (
          <div data-testid={`${p.testId}-tx-hold`}>
            {p.hold?.face ?? null}
            <span data-testid={`${p.testId}-tx-hint`}>{p.hold?.hint}</span>
          </div>
        )}
      </div>
    );
  },
}));
// The reveal window's handle, as the ritual reaches it through Thread's revealRef; the window itself still draws.
vi.mock('../../src/motion/reveal-window', async (orig) => {
  const real = await orig<typeof import('../../src/motion/reveal-window')>();
  const { useImperativeHandle } = await import('react');
  return {
    ...real,
    RevealWindow: (p: Parameters<typeof real.RevealWindow>[0]) => {
      useImperativeHandle(p.ref, () => ({ setRange: spies.setRange, reset: spies.reset }), []);
      return <real.RevealWindow {...p} ref={undefined} />;
    },
  };
});
// Every haptic pulse in the tree: LazyActionFlow is a stand-in here, so a pulse could only come from the ritual.
vi.mock('../../src/motion/haptics', () => ({
  useHaptics: () => ({ supported: true, enabled: true, setEnabled: () => {}, pulse: spies.pulse }),
}));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const { modelEngine } = await import('@atropyle/sdk');
  // The vault's engine (usePolicyEngine): the devnet's, the reference model.
  const atro = { engine: () => modelEngine(), engineFor: async () => modelEngine() };
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({ deployment: fixtureDeployment(), atro, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/vault/', useRouter: () => ({ push: vi.fn() }) }));

const SDK = { atro: {}, deployment: { explorerUrl: null, factoryBlock: 0n } } as unknown as Sdk;
/** A block in the millions, as on X Layer: its digits are grouped, as the receipt above the line groups them. */
const RESULT = { vault: PEOPLE.vault, steps: [{ blockNumber: 1_234_567n }] } as unknown as SendResult;

// fetchedAtMs is now: useChainNow adds the time since the read to blockTimestamp, so 0 would put "now" decades past lateAt.
function loadedWith(
  change: (s: ReturnType<typeof fixtureSnapshot>) => ReturnType<typeof fixtureSnapshot> = (s) => s,
): RegisteredVault {
  return { snap: change(fixtureSnapshot()), registered: true, timeline: fixtureTimeline(), fetchedAtMs: Date.now() };
}

function reducedMotion() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches: q.includes('reduce'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function ritual(loaded = loadedWith(), lang: 'en' | 'vi' = 'en', onChanged = vi.fn()) {
  const view = flows.vaultView(loaded.snap, loaded.timeline, PEOPLE.owner);
  renderWithProviders(
    <Ritual flows={flows} sdk={SDK} loaded={loaded} view={view} account={PEOPLE.owner} onChanged={onChanged} />,
    { lang },
  );
  return onChanged;
}

const props = () => flow.last.get('owner-checkin') as ActionFlowProps;
const phase = () => screen.getByTestId('owner-ritual').getAttribute('data-ritual');
const hint = () => screen.getByTestId('owner-checkin-tx-hint').textContent;
const nowAt = () => screen.getByTestId('owner-ritual-face').querySelector<HTMLElement>('[data-part="now-at"]');
const knots = () => screen.getByTestId('owner-ritual-face').querySelectorAll('[data-part="knot"]').length;
const progress = (p: Partial<{ committed: boolean; finished: boolean; busy: boolean; sent: boolean }>) =>
  act(() => props().onProgress?.({ committed: false, finished: false, busy: false, sent: false, ...p }));

beforeEach(() => {
  flow.last.clear();
  flow.done.clear();
  spies.setRange.mockClear();
  spies.reset.mockClear();
  spies.pulse.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the check-in ritual', () => {
  it('prepares the check-in at once and holds it with the ritual words, no knot of its own', () => {
    ritual();
    expect(props().resettable).toBe(false);
    expect(screen.getByTestId('owner-checkin').getAttribute('data-auto')).toBe('true');
    expect(props().action).toEqual({ type: 'checkIn' });
    expect(props().confirm).toBe('hold');
    // The ritual is the card's first thing, before the step and its wallet mirror (TxCard holdPlacement).
    expect(props().holdPlacement).toBe('top');
    expect(props().hold?.showKnot).toBe(false);
    expect(props().hold?.doneLabel).toBe('Now sign in your wallet');
    expect(phase()).toBe('idle');
    expect(hint()).toBe('Hold for a moment, or press Enter');
    // The live line is for a screen reader only, in every phase: what the eye reads stays in the hold's own slots.
    expect(screen.getByTestId('owner-ritual-status').className).toContain('sr-only');
  });

  it('runs holding → wallet → sent → tied, and ties the knot only with the receipt', () => {
    const onChanged = ritual();
    act(() => props().hold?.onHoldStart?.());
    expect(phase()).toBe('holding');
    act(() => props().hold?.onHoldEnd?.(true));
    expect(phase()).toBe('holding');
    progress({ busy: true });
    expect(phase()).toBe('wallet');
    // The hollow knot waits where the solid one will tie (TIED_KNOT, 5 %): whole on screen, never clipped at 0.
    expect(nowAt()?.querySelector('[data-part="pending"]')).not.toBeNull();
    expect(nowAt()?.style.transform).toMatch(/^translate\(5%,/);
    expect(hint()).toBe('Now sign in your wallet');
    expect(props().resetLabel).toBeUndefined();
    progress({ busy: true, committed: true, sent: true });
    expect(phase()).toBe('sent');
    expect(nowAt()?.querySelector('[data-part="pending"]')).not.toBeNull();
    expect(nowAt()?.style.transform).toMatch(/^translate\(5%,/);
    // Under the disabled button, the wait and its seconds: no instruction the owner cannot follow.
    expect(hint()).toMatch(/^Waiting for X Layer\u00a0·\u00a0\d+\.\d\u00a0s$/);
    expect(hint()).not.toContain('Hold');
    expect(screen.getByTestId('owner-ritual-status').textContent).toContain('Waiting for X Layer');
    expect(screen.getByTestId('owner-ritual-status').className).toContain('sr-only');
    expect(props().resetLabel).toBeUndefined();
    // From the wallet on, Start over is offered (a stuck prompt); at rest there is nothing to start over.
    expect(props().resettable).toBe(true);
    // R18.16: before the receipt nothing says Confirmed and no knot is tied.
    expect(document.body.textContent).not.toContain('Confirmed');
    expect(knots()).toBe(0);
    expect(screen.queryByTestId('owner-tied')).toBeNull();
    act(() => {
      flow.done.add('owner-checkin');
      props().onDone?.(RESULT);
    });
    expect(phase()).toBe('sent');
    progress({ committed: true, finished: true });
    expect(phase()).toBe('tied');
    // The last words of a tied knot invite the next one; nothing reads as "something broke, start over".
    expect(props().resetLabel).toBe('Check in again');
    // The attribute keeps the raw number; the words group its digits, as the Receipt's Block line does.
    expect(screen.getByTestId('owner-tied').getAttribute('data-block')).toBe('1234567');
    // The hold's end says it, where the bar stood: the status sentence stays for a screen reader only.
    expect(screen.getByTestId('owner-ritual-status').className).toContain('sr-only');
    expect(screen.getByTestId('owner-ritual-status').textContent).toContain('Your check-in is in block 1,234,567.');
    expect(screen.getByTestId('owner-tied').textContent).toMatch(
      /^Tied at block\u00a01,234,567\u00a0·\u00a0\d+\.\d\u00a0s$/,
    );
    // The hold is gone: in its place the hold's end, the thread and its solid knot on its face (hold.face), the tied
    // line alone where the bar stood (the footer), before the Receipt's rows. One face, so the knot ties in place.
    expect(screen.queryByTestId('owner-checkin-tx-hold')).toBeNull();
    expect(screen.getAllByTestId('owner-ritual-face')).toHaveLength(1);
    expect(screen.getByTestId('owner-checkin-tx-end').contains(screen.getByTestId('owner-ritual-face'))).toBe(true);
    const band = screen.getByTestId('owner-checkin-tx-end-band');
    expect(band.contains(screen.getByTestId('owner-tied'))).toBe(true);
    expect(band.contains(screen.getByTestId('owner-ritual-face'))).toBe(false);
    expect(knots()).toBe(1);
    expect(screen.getByTestId('owner-ritual-face').querySelector('[data-part="pending"]')).toBeNull();
    // The tied knot is the focal mark: solid, on the lit thread's first point ("now" stands on it), drawn above "now".
    const face = screen.getByTestId('owner-ritual-face');
    const knot = face.querySelector<HTMLElement>('[data-part="knot"]');
    expect(knot?.getAttribute('data-tone')).toBe('tied');
    expect(knot?.className).toContain('bg-current');
    expect(knot?.className).not.toContain('bg-bg');
    expect(knot?.style.left).toBe('5%');
    expect(face.querySelector<HTMLElement>('[data-part="now-at"]')?.style.transform).toMatch(/^translate\(5%,/);
    const marks = [...face.querySelectorAll('[data-layer="marks"] > [data-part]')].map((e) =>
      e.getAttribute('data-part'),
    );
    expect(marks.indexOf('knot')).toBeGreaterThan(marks.indexOf('now-at'));
    expect(onChanged).toHaveBeenCalledWith(RESULT);
    // The runner's own 12 ms pulse marks the receipt (useTxRunner.finish): the ritual adds none.
    expect(spies.pulse).not.toHaveBeenCalled();
  });

  it('draws the pending knot for an owner checking in late (no time left on the thread)', () => {
    ritual(loadedWith((s) => ({ ...s, status: { ...s.status, lastAlive: 900n, lateAt: 960n } })));
    const face = () => screen.getByTestId('owner-ritual-face');
    // Late: threadRemaining is 0, so at rest the face has no "now".
    expect(face().querySelector('[data-part="now"]')).toBeNull();
    progress({ busy: true });
    expect(phase()).toBe('wallet');
    expect(face().querySelector('[data-part="pending"]')).not.toBeNull();
    progress({ busy: true, committed: true, sent: true });
    expect(face().querySelector('[data-part="pending"]')).not.toBeNull();
  });

  it('recharges the thread over the hold with motion, and an early release springs it back', () => {
    ritual();
    act(() => props().hold?.onHoldStart?.());
    // Up to where a fresh knot ties (FACE_EDGE, 5 %), never to the face's edge, where "now" would be cut in half.
    expect(spies.setRange).toHaveBeenCalledWith(5, 100, { linear: HOLD_MS });
    act(() => props().hold?.onHoldEnd?.(false));
    expect(spies.reset).toHaveBeenCalled();
  });

  it('under reduced motion the hold moves nothing on the thread', () => {
    reducedMotion();
    ritual();
    act(() => props().hold?.onHoldStart?.());
    expect(phase()).toBe('holding');
    expect(spies.setRange).not.toHaveBeenCalled();
  });

  it('an early release goes back to idle', () => {
    ritual();
    act(() => props().hold?.onHoldStart?.());
    act(() => props().hold?.onHoldEnd?.(false));
    expect(phase()).toBe('idle');
  });

  it('Start over brings it back to idle, the receipt line gone', () => {
    ritual();
    act(() => {
      flow.done.add('owner-checkin');
      props().onDone?.(RESULT);
    });
    progress({ committed: true, finished: true });
    expect(phase()).toBe('tied');
    expect(screen.getByTestId('owner-tied')).toBeTruthy();
    act(() => {
      flow.done.delete('owner-checkin');
      props().onReset?.();
    });
    expect(phase()).toBe('idle');
    expect(screen.queryByTestId('owner-tied')).toBeNull();
  });

  it('restores the phase when the tab comes back: a hold is dropped, the wallet is still the wallet', () => {
    ritual();
    const visibility = (v: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    act(() => props().hold?.onHoldStart?.());
    visibility('hidden');
    visibility('visible');
    expect(phase()).toBe('idle');
    progress({ busy: true, committed: true });
    visibility('hidden');
    visibility('visible');
    expect(phase()).toBe('wallet');
  });

  it("says the guarded Drill's own minutes, with the guardians' condition", async () => {
    ritual();
    const drill = await screen.findByTestId('owner-drill');
    expect(drill.getAttribute('data-kind')).toBe('guarded');
    // The rules' minutes, as the time machine says them, and the keeper's rounds named apart.
    expect(drill.textContent).toContain('after 4 minutes once enough guardians confirm (2 of 3)');
    expect(drill.textContent).toContain('or after 15 minutes if nobody does');
    expect(drill.textContent).toContain("The keeper's rounds add up to about 2 minutes more.");
  });

  it('says one time for a Drill without guardians', async () => {
    ritual(loadedWith((s) => ({ ...s, config: { ...s.config, guardians: [], k: 0, recoveryEnabled: false } })));
    const drill = await screen.findByTestId('owner-drill');
    expect(drill.getAttribute('data-kind')).toBe('simple');
    expect(drill.textContent).toBe(
      "Stop checking in and the rules let your heirs receive after 4 minutes. The keeper's rounds add up to about 2 minutes more.",
    );
  });

  it('says when the next check-in is due', () => {
    ritual();
    expect(screen.getByTestId('owner-due').getAttribute('data-kind')).toBe('dueActive');
  });

  it('in Vietnamese: no "Đã xác nhận" and no knot before the receipt', () => {
    ritual(loadedWith(), 'vi');
    progress({ busy: true, committed: true, sent: true });
    expect(document.body.textContent).not.toContain('Đã xác nhận');
    expect(knots()).toBe(0);
    expect(hint()).toMatch(/^Đang chờ X\u00a0Layer\u00a0·\u00a0\d+,\d\u00a0s$/);
    expect(screen.getByTestId('owner-ritual-status').textContent).toContain('Đang chờ X\u00a0Layer');
  });

  it('in Vietnamese, the block of a tied knot is grouped the Vietnamese way', () => {
    ritual(loadedWith(), 'vi');
    act(() => {
      flow.done.add('owner-checkin');
      props().onDone?.(RESULT);
    });
    progress({ committed: true, finished: true });
    expect(screen.getByTestId('owner-tied').getAttribute('data-block')).toBe('1234567');
    expect(screen.getByTestId('owner-tied').textContent).toMatch(
      /^Đã thắt nút ở block\u00a01\.234\.567\u00a0·\u00a0\d+,\d\u00a0s$/,
    );
    expect(screen.getByTestId('owner-ritual-status').textContent).toContain('vào block 1.234.567.');
  });
});
