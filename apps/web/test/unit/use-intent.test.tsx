import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIntent, yieldToMain } from '../../src/lib/use-intent';
import { FakeObserver, stubIntersection } from '../helpers/intersection';

let seen: boolean[] = [];
function Probe() {
  const scene = useRef<HTMLElement>(null);
  const watch = useRef<HTMLDivElement>(null);
  seen.push(useIntent(scene, watch));
  return (
    <section ref={scene} data-testid="scene">
      <button type="button">inside</button>
      <div ref={watch} data-testid="watch" />
    </section>
  );
}
const last = () => seen[seen.length - 1];

function stubIdle() {
  const idle = vi.fn((cb: IdleRequestCallback, _o?: IdleRequestOptions) =>
    window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0),
  );
  vi.stubGlobal('requestIdleCallback', idle);
  vi.stubGlobal(
    'cancelIdleCallback',
    vi.fn((id: number) => window.clearTimeout(id)),
  );
  return idle;
}
const pause = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

afterEach(() => {
  seen = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useIntent (R18.18)', () => {
  it('does nothing at mount: no observer, no idle callback, no intent', async () => {
    stubIntersection();
    const idle = stubIdle();
    render(<Probe />);
    await pause();
    expect(FakeObserver.all).toHaveLength(0);
    expect(idle).not.toHaveBeenCalled();
    expect(last()).toBe(false);
  });

  for (const fire of ['pointerDown', 'keyDown', 'focusIn'] as const) {
    it(`takes a ${fire} in the scene as intent: an idle callback of 2 s at most, a yield, then true`, async () => {
      stubIntersection();
      const idle = stubIdle();
      const { getByRole } = render(<Probe />);
      fireEvent[fire](getByRole('button'));
      expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2_000 });
      await waitFor(() => expect(last()).toBe(true));
    });
  }

  it('arms the observer on the first wheel only; a quarter of the watched box in view is intent, less is not', async () => {
    stubIntersection();
    stubIdle();
    const { getByTestId } = render(<Probe />);
    expect(FakeObserver.all).toHaveLength(0);
    fireEvent.wheel(window);
    fireEvent.wheel(window);
    expect(FakeObserver.all).toHaveLength(1);
    const io = FakeObserver.all[0];
    expect(io.options).toEqual({ rootMargin: '0px', threshold: 0.25 });
    const watch = getByTestId('watch');
    expect([...io.targets]).toEqual([watch]);
    const show = (ratio: number) =>
      act(() => {
        io.callback(
          [
            {
              target: watch,
              isIntersecting: ratio > 0,
              intersectionRatio: ratio,
            } as unknown as IntersectionObserverEntry,
          ],
          io as unknown as IntersectionObserver,
        );
      });
    show(0.1);
    await pause();
    expect(last()).toBe(false);
    show(0.3);
    await waitFor(() => expect(last()).toBe(true));
    expect(io.targets.size).toBe(0);
  });

  it('is armed by a touchmove and by a scroll key, never by a key typed in a field', async () => {
    stubIntersection();
    stubIdle();
    const field = document.body.appendChild(document.createElement('input'));
    render(<Probe />);
    fireEvent.keyDown(field, { key: ' ' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(FakeObserver.all).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(FakeObserver.all).toHaveLength(1);
    field.remove();
    seen = [];
    FakeObserver.all = [];
    render(<Probe />);
    fireEvent.touchMove(window);
    expect(FakeObserver.all).toHaveLength(1);
  });

  it('takes the first scroll as intent in a browser without IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    stubIdle();
    render(<Probe />);
    fireEvent.wheel(window);
    await waitFor(() => expect(last()).toBe(true));
  });

  it('cancels the idle callback when the scene goes before it runs', () => {
    stubIntersection();
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 7),
    );
    const cancel = vi.fn();
    vi.stubGlobal('cancelIdleCallback', cancel);
    const { getByRole, unmount } = render(<Probe />);
    fireEvent.focusIn(getByRole('button'));
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('yields with scheduler.yield where the browser has it', async () => {
    const y = vi.fn(async () => {});
    vi.stubGlobal('scheduler', { yield: y });
    await yieldToMain();
    expect(y).toHaveBeenCalledTimes(1);
  });
});
