import { act, fireEvent, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { LangProvider } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { memoryKV } from '../../src/lib/store';
import { MotionProvider } from '../../src/motion/provider';
import type { HoldBind } from '../../src/motion/use-hold';
import { HoldButton, type HoldButtonProps } from '../../src/ui/hold-button';
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
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
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

  it('accepts none of the handlers it binds itself, nor a description', () => {
    // A caller's onKeyDown, onPointerDown, … or aria-describedby would be replaced without a word.
    expectTypeOf<Extract<keyof HoldButtonProps, keyof HoldBind | 'aria-describedby'>>().toBeNever();
  });

  it('describes how to use it', () => {
    const { button } = setup();
    const id = button.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Hold to confirm, or press Enter');
  });

  it('shows the fill and the thread while held under reduced motion on a prerendered, hydrated page', async () => {
    // motion's frame loop and its lazy features need real time; a long hold keeps the timer out of the way.
    vi.useRealTimers();
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
      await vi.waitFor(() => expect(fill.style.opacity).toBe('0'));
      act(() => {
        press(button);
      });
      expect(button.getAttribute('data-phase')).toBe('holding');
      await vi.waitFor(() => {
        for (const el of [fill, thread]) {
          expect(el.style.opacity).toBe('1');
          expect(el.style.transform).not.toContain('scaleX(0)');
        }
      });
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });
});
