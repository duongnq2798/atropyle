import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MotionGlobalConfig, processFrame } from 'motion/react';
import type { PointerEvent, SyntheticEvent } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { LangProvider } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { memoryKV } from '../../src/lib/store';
import { MotionProvider } from '../../src/motion/provider';
import { DURATION, REDUCED_MS } from '../../src/motion/tokens';
import { type HoldBind, useHold } from '../../src/motion/use-hold';
import { HoldButton, type HoldButtonProps, type HoldWords } from '../../src/ui/hold-button';
import { renderWithProviders } from '../helpers/render';

function setup(props: { disabled?: boolean } = {}) {
  const onConfirm = vi.fn();
  renderWithProviders(
    <HoldButton onConfirm={onConfirm} disabled={props.disabled}>
      Check in
    </HoldButton>,
  );
  return { onConfirm, button: screen.getByRole('button', { name: 'Check in' }) };
}

const press = (el: HTMLElement) => fireEvent.pointerDown(el, { button: 0 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HoldButton', () => {
  it('confirms once after a 600 ms hold', () => {
    const { onConfirm, button } = setup();
    press(button);
    expect(button.getAttribute('data-phase')).toBe('holding');
    act(() => vi.advanceTimersByTime(599));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.getAttribute('data-phase')).toBe('done');
    fireEvent.pointerUp(button);
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.getAttribute('data-phase')).toBe('idle');
  });

  it('cancels when released early and says to keep holding', () => {
    const { onConfirm, button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button);
    expect(button.getAttribute('data-phase')).toBe('idle');
    expect(screen.getByText('Keep holding')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Hold to confirm, or press Enter')).toBeTruthy();
  });

  it('shakes once on an early release, and again on the next one', () => {
    const { button } = setup();
    expect(button.hasAttribute('data-shake')).toBe(false);
    press(button);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button);
    expect(button.hasAttribute('data-shake')).toBe(true);
    act(() => vi.advanceTimersByTime(DURATION.slow));
    expect(button.hasAttribute('data-shake')).toBe(false);
    press(button);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button);
    expect(button.hasAttribute('data-shake')).toBe(true);
  });

  it('does not shake under reduced motion, and still says to keep holding', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const { button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button);
    expect(button.hasAttribute('data-shake')).toBe(false);
    expect(screen.getByText('Keep holding')).toBeTruthy();
  });

  it('cancels when the pointer leaves or the browser takes it over', () => {
    const { onConfirm, button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerLeave(button);
    expect(button.getAttribute('data-phase')).toBe('idle');
    press(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerCancel(button);
    expect(button.getAttribute('data-phase')).toBe('idle');
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores the right mouse button, a plain mouse click, and the long-press menu', () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button, { button: 2 });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(button, { detail: 1 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(button)).toBe(false);
  });

  it('HoldButton keyboard and assistive activation', () => {
    const { onConfirm, button } = setup();
    // Enter confirms at once (spec §4.6) and only once, even when pressed again or auto-repeated.
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));

    // Space is a hold: released early it cancels, and the click the browser sends after it does not confirm.
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyUp(button, { key: ' ' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));

    // Held for 600 ms it confirms.
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(600));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    fireEvent.keyUp(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(2000));

    // A click with detail 0 comes from assistive technology (screen reader, switch access): it confirms.
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(3);
  });

  it('does nothing while disabled, and a hold in progress stops when it becomes disabled', () => {
    const onConfirm = vi.fn();
    const { rerender } = renderWithProviders(<HoldButton onConfirm={onConfirm}>Release</HoldButton>);
    const button = screen.getByRole('button', { name: 'Release' });
    press(button);
    act(() => vi.advanceTimersByTime(300));
    rerender(
      <HoldButton onConfirm={onConfirm} disabled>
        Release
      </HoldButton>,
    );
    // Stopped, not cancelled: a button that can no longer be held does not ask to keep holding.
    expect(button.getAttribute('data-phase')).toBe('idle');
    expect(screen.queryByText('Keep holding')).toBeNull();
    expect(button.hasAttribute('data-shake')).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('useHold stops a hold that becomes disabled without calling onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { result, rerender } = renderHook(({ disabled }) => useHold({ onConfirm, onCancel, disabled }), {
      initialProps: { disabled: false },
    });
    act(() => result.current.bind.onPointerDown({ button: 0 } as PointerEvent<HTMLElement>));
    expect(result.current.phase).toBe('holding');
    act(() => vi.advanceTimersByTime(300));
    rerender({ disabled: true });
    expect(result.current.phase).toBe('idle');
    act(() => vi.advanceTimersByTime(1000));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('settles and accepts the next hold when onConfirm throws', () => {
    const onConfirm = vi.fn().mockImplementationOnce(() => {
      throw new Error('onConfirm failed');
    });
    renderWithProviders(<HoldButton onConfirm={onConfirm}>Check in</HoldButton>);
    const button = screen.getByRole('button', { name: 'Check in' });
    press(button);
    expect(() => act(() => vi.advanceTimersByTime(600))).toThrow('onConfirm failed');
    fireEvent.pointerUp(button);
    act(() => vi.advanceTimersByTime(2000));
    expect(button.getAttribute('data-phase')).toBe('idle');
    press(button);
    act(() => vi.advanceTimersByTime(600));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("runs a caller's handlers first, and the hold still runs after they call preventDefault()", () => {
    const log: string[] = [];
    const onConfirm = vi.fn(() => {
      log.push('confirm');
    });
    const NAMES = [
      'onKeyDown',
      'onKeyUp',
      'onPointerDown',
      'onPointerUp',
      'onPointerLeave',
      'onPointerCancel',
      'onBlur',
    ] as const satisfies readonly (keyof HoldBind)[];
    const theirs: Pick<HoldButtonProps, (typeof NAMES)[number]> = Object.fromEntries(
      NAMES.map((name) => [
        name,
        (e: SyntheticEvent) => {
          log.push(name);
          e.preventDefault();
        },
      ]),
    );
    // A caller's context menu handler that does not prevent it: the hold's still does.
    const onContextMenu = vi.fn();
    renderWithProviders(
      <HoldButton onConfirm={onConfirm} onContextMenu={onContextMenu} {...theirs}>
        Check in
      </HoldButton>,
    );
    const button = screen.getByRole('button', { name: 'Check in' });
    const phase = () => button.getAttribute('data-phase');

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(log).toEqual(['onKeyDown', 'confirm']);
    act(() => vi.advanceTimersByTime(2000));

    fireEvent.keyDown(button, { key: ' ' });
    expect(phase()).toBe('holding');
    fireEvent.keyUp(button, { key: ' ' });
    expect(phase()).toBe('idle');
    for (const release of [fireEvent.pointerUp, fireEvent.pointerLeave, fireEvent.pointerCancel, fireEvent.blur]) {
      press(button);
      expect(phase()).toBe('holding');
      release(button);
      expect(phase()).toBe('idle');
    }
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(log).toEqual([
      'onKeyDown',
      'confirm',
      'onKeyDown',
      'onKeyUp',
      ...['onPointerUp', 'onPointerLeave', 'onPointerCancel', 'onBlur'].flatMap((n) => ['onPointerDown', n]),
    ]);

    expect(fireEvent.contextMenu(button)).toBe(false);
    expect(onContextMenu).toHaveBeenCalledOnce();
  });

  it("still cancels the hold when a caller's handler throws", () => {
    // React reports an error thrown by a handler as a window error event; this test takes it over.
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      const onConfirm = vi.fn();
      renderWithProviders(
        <HoldButton
          onConfirm={onConfirm}
          onPointerUp={() => {
            throw new Error('caller failed');
          }}
        >
          Check in
        </HoldButton>,
      );
      const button = screen.getByRole('button', { name: 'Check in' });
      press(button);
      act(() => vi.advanceTimersByTime(300));
      fireEvent.pointerUp(button);
      expect(button.getAttribute('data-phase')).toBe('idle');
      act(() => vi.advanceTimersByTime(1000));
      expect(onConfirm).not.toHaveBeenCalled();
      expect(errors).toEqual([new Error('caller failed')]);
    } finally {
      window.removeEventListener('error', onError);
    }
  });

  it("joins a caller's aria-describedby with its own hint", () => {
    renderWithProviders(
      <>
        <p id="warning">This cannot be undone.</p>
        <HoldButton onConfirm={vi.fn()} aria-describedby="warning">
          Release
        </HoldButton>
      </>,
    );
    const ids = screen.getByRole('button', { name: 'Release' }).getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'This cannot be undone.',
      'Hold to confirm, or press Enter',
    ]);
  });

  it('accepts neither onClick nor type, which would go around the hold', () => {
    expectTypeOf<Extract<keyof HoldButtonProps, 'onClick' | 'type'>>().toBeNever();
  });

  it('describes how to use it', () => {
    const { button } = setup();
    const id = button.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Hold to confirm, or press Enter');
  });

  it('shows the fill and the thread while held under reduced motion on a prerendered, hydrated page, then fades them', async () => {
    // motion's frame loop and its lazy features need real time; a long hold keeps the timer out of the way.
    vi.useRealTimers();
    // Real frames and a lazy chunk: a full parallel run once took over the 1 s default of vi.waitFor (parked T9).
    const settled = { timeout: 5000 };
    // The static export prerenders with motion allowed: usePrefersReducedMotion is false until hydrated.
    const tree = (
      <KVProvider kv={memoryKV()}>
        <LangProvider>
          <MotionProvider>
            <HoldButton onConfirm={() => {}} duration={10_000}>
              Check in
            </HoldButton>
          </MotionProvider>
        </LangProvider>
      </KVProvider>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, tree);
      });
      const button = screen.getByRole('button', { name: 'Check in' });
      const [fill, thread] = Array.from(button.querySelectorAll<HTMLElement>('span.origin-left'));
      // Hydrated, the features loaded and the reduced motion preference applied: the fill rests faded out.
      await vi.waitFor(() => expect(fill.style.opacity).toBe('0'), settled);
      act(() => {
        press(button);
      });
      expect(button.getAttribute('data-phase')).toBe('holding');
      await vi.waitFor(() => {
        for (const el of [fill, thread]) {
          expect(el.style.opacity).toBe('1');
          expect(el.style.transform).not.toContain('scaleX(0)');
        }
      }, settled);

      // Released, they fade out at full width over DURATION.quick and collapse only once out of sight. A hand-driven
      // frame samples the fade an eighth of the way through (JS animations, no WAAPI), so the check is not a race.
      MotionGlobalConfig.skipAnimations = false;
      MotionGlobalConfig.useManualTiming = true;
      const t0 = performance.now();
      processFrame(t0);
      act(() => {
        fireEvent.pointerUp(button);
      });
      processFrame(t0 + DURATION.quick / 8);
      for (const el of [fill, thread]) {
        expect(Number(el.style.opacity), 'mid-fade').toBeGreaterThan(0);
        expect(Number(el.style.opacity), 'mid-fade').toBeLessThan(1);
        // 'none' is scaleX 1: neither cut to 0 (reduced motion makes a scaleX step instant) nor shrinking.
        expect(el.style.transform, 'full width while fading').toBe('none');
      }
      // Back on the real clock, the fade ends and transitionEnd collapses them.
      MotionGlobalConfig.useManualTiming = false;
      await vi.waitFor(() => {
        for (const el of [fill, thread]) {
          expect(el.style.opacity).toBe('0');
          expect(el.style.transform).toContain('scaleX(0)');
        }
      }, settled);
    } finally {
      MotionGlobalConfig.useManualTiming = false;
      MotionGlobalConfig.skipAnimations = true;
      act(() => root?.unmount());
      container.remove();
    }
  }, 20_000);
});

describe('hold words (R18.16)', () => {
  it('says the caller words once held, never "Confirmed", and ties no knot when showKnot is false', () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <HoldButton onConfirm={onConfirm} doneLabel="Now confirm in your wallet" showKnot={false}>
        Receive
      </HoldButton>,
    );
    const button = screen.getByRole('button', { name: 'Receive' });
    expect(button.querySelector('[data-part="knot"]')).toBeNull();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('data-phase')).toBe('done');
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.getByText('Now confirm in your wallet')).toBeTruthy();
  });

  it('null says nothing once held', () => {
    renderWithProviders(
      <HoldButton onConfirm={() => {}} doneLabel={null}>
        Receive
      </HoldButton>,
    );
    const button = screen.getByRole('button', { name: 'Receive' });
    fireEvent.keyDown(button, { key: 'Enter' });
    const hint = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('');
  });

  it('keeps "Confirmed" and the knot by default', () => {
    renderWithProviders(<HoldButton onConfirm={() => {}}>Check in</HoldButton>);
    const button = screen.getByRole('button', { name: 'Check in' });
    expect(button.querySelector('[data-part="knot"]')).not.toBeNull();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });
});

describe('the hold callbacks and the face (Task 10)', () => {
  it('says when a hold starts and how it ends, and Enter confirms without a start', () => {
    const onConfirm = vi.fn();
    const onHoldStart = vi.fn();
    const onHoldEnd = vi.fn();
    renderWithProviders(
      <HoldButton onConfirm={onConfirm} onHoldStart={onHoldStart} onHoldEnd={onHoldEnd}>
        Check in
      </HoldButton>,
    );
    const button = screen.getByRole('button', { name: 'Check in' });
    press(button);
    expect(onHoldStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button);
    expect(onHoldEnd).toHaveBeenLastCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onHoldEnd).toHaveBeenLastCalledWith(true);
    expect(onHoldStart).toHaveBeenCalledTimes(1);
  });

  it('confirms a full hold, then says it ended confirmed', () => {
    const onConfirm = vi.fn();
    const onHoldEnd = vi.fn();
    renderWithProviders(
      <HoldButton onConfirm={onConfirm} onHoldEnd={onHoldEnd}>
        Check in
      </HoldButton>,
    );
    press(screen.getByRole('button', { name: 'Check in' }));
    act(() => vi.advanceTimersByTime(600));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onHoldEnd).toHaveBeenCalledWith(true);
  });

  it('makes the face and the button one object: the thread on its face, the label on an accent bar under it', () => {
    renderWithProviders(
      <HoldButton onConfirm={() => {}} face={<span data-testid="face" />}>
        Check in
      </HoldButton>,
    );
    const button = screen.getByRole('button', { name: 'Check in' });
    const face = screen.getByTestId('face');
    const bar = button.querySelector<HTMLElement>('[data-part="bar"]');
    if (!bar) throw new Error('no bar');
    // In the button's own box, above its label: one press target, one focus ring, one shake.
    expect(button.contains(face)).toBe(true);
    expect(face.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.textContent).toBe('Check in');
    // Large: the column's full width up to 28rem, a bar of at least 3.5rem, the label in the lead size, and the
    // primary action's accent, never the neutral pill of a secondary action.
    expect(button.className).toContain('w-full');
    expect(button.parentElement?.className).toContain('max-w-md');
    expect(button.className).not.toContain('rounded-full');
    expect(button.className).not.toContain('bg-surface-2');
    for (const c of ['min-h-14', 'text-lead', 'bg-thread', 'text-on-thread']) expect(bar.className).toContain(c);
    // The fill sweeps the bar towards the ink, away from the label's colour: the label only gains contrast as it fills.
    const fill = bar.querySelector<HTMLElement>('span.origin-left');
    expect(fill?.className).toContain('bg-ink/25');
    expect(fill?.className).not.toContain('bg-on-thread');
    // The pill's own line under the label stays out: the face is the thread.
    expect(button.querySelector('[data-part="underline"]')).toBeNull();
  });

  it('disabled, the face keeps its thread at full strength: only the bar goes quiet', () => {
    renderWithProviders(
      <HoldButton onConfirm={() => {}} disabled face={<span data-testid="face" />}>
        Sending…
      </HoldButton>,
    );
    const button = screen.getByRole('button', { name: 'Sending…' });
    expect(button.className).not.toContain('disabled:opacity-50');
    expect(button.querySelector('[data-part="bar"]')?.className).toContain('group-disabled:');
  });

  it('without a face it stays the pill, its thread under the label', () => {
    const { button } = setup();
    expect(button.className).toContain('rounded-full');
    expect(button.querySelector('[data-part="bar"]')).toBeNull();
    expect(button.querySelector('[data-part="underline"]')).not.toBeNull();
  });

  it('shakes again on a second early release (parked item 59)', () => {
    renderWithProviders(<HoldButton onConfirm={() => {}}>Check in</HoldButton>);
    const button = screen.getByRole('button', { name: 'Check in' });
    press(button);
    fireEvent.pointerUp(button);
    expect(button.hasAttribute('data-shake')).toBe(true);
    press(button);
    fireEvent.pointerUp(button);
    expect(button.hasAttribute('data-shake')).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(button.hasAttribute('data-shake')).toBe(true);
  });

  it('says the hold ended confirmed even when onConfirm throws', () => {
    const onHoldEnd = vi.fn();
    renderWithProviders(
      <HoldButton
        onConfirm={() => {
          throw new Error('refused');
        }}
        onHoldEnd={onHoldEnd}
      >
        Check in
      </HoldButton>,
    );
    press(screen.getByRole('button', { name: 'Check in' }));
    expect(() => act(() => vi.advanceTimersByTime(600))).toThrow('refused');
    expect(onHoldEnd).toHaveBeenCalledTimes(1);
    expect(onHoldEnd).toHaveBeenCalledWith(true);
  });

  it('under reduced motion the knot fades in at full size over REDUCED_MS, never from scale 0 (parked item 59)', async () => {
    // motion's features load lazily and its frames need real time, as in the hydrated reduced-motion test above.
    vi.useRealTimers();
    const settled = { timeout: 5000 };
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const view = render(
      <KVProvider kv={memoryKV()}>
        <LangProvider>
          <MotionProvider>
            <HoldButton onConfirm={() => {}} duration={10_000}>
              Check in
            </HoldButton>
          </MotionProvider>
        </LangProvider>
      </KVProvider>,
    );
    try {
      const button = screen.getByRole('button', { name: 'Check in' });
      const knot = button.querySelector<HTMLElement>('[data-part="knot"]');
      if (!knot) throw new Error('no knot');
      const [fill] = Array.from(button.querySelectorAll<HTMLElement>('span.origin-left'));
      // At rest: full size, out of sight.
      expect(knot.style.opacity).toBe('0');
      expect(knot.style.transform).not.toContain('scale(0)');
      // The features are in once a hold fades the fill in; let go early (a 10 s hold) and wait for the fade out.
      act(() => {
        press(button);
      });
      await vi.waitFor(() => expect(fill.style.opacity).toBe('1'), settled);
      act(() => {
        fireEvent.pointerUp(button);
      });
      await vi.waitFor(() => expect(fill.style.opacity).toBe('0'), settled);

      // Enter confirms; a hand-driven frame samples the knot halfway through REDUCED_MS.
      MotionGlobalConfig.skipAnimations = false;
      MotionGlobalConfig.useManualTiming = true;
      const t0 = performance.now();
      processFrame(t0);
      act(() => {
        fireEvent.keyDown(button, { key: 'Enter' });
      });
      processFrame(t0 + REDUCED_MS / 2);
      expect(Number(knot.style.opacity), 'mid-fade').toBeGreaterThan(0);
      expect(Number(knot.style.opacity), 'mid-fade').toBeLessThan(1);
      expect(knot.style.transform, 'full size while fading').not.toMatch(/scale\(0(\.\d+)?\)/);
      processFrame(t0 + REDUCED_MS + DURATION.instant);
      expect(knot.style.opacity).toBe('1');
      expect(knot.style.transform).not.toMatch(/scale\(0(\.\d+)?\)/);
    } finally {
      MotionGlobalConfig.useManualTiming = false;
      MotionGlobalConfig.skipAnimations = true;
      view.unmount();
    }
  }, 20_000);

  it('passes the face and the hold callbacks through HoldWords', () => {
    expectTypeOf<HoldWords>().toHaveProperty('face');
    expectTypeOf<HoldWords>().toHaveProperty('onHoldStart');
    expectTypeOf<HoldWords>().toHaveProperty('onHoldEnd');
  });
});
