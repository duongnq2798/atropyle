import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevealWindow, type RevealWindowHandle, revealTransforms } from '../../src/motion/reveal-window';
import { EASE_OUT_EXPO, SPRING_MS } from '../../src/motion/tokens';
import { Thread } from '../../src/thread/thread';

/**
 * An engine from before CSS linear() (Safari 16.4 to 17.1, Chrome 111 and 112, Firefox 111: all inside Next's
 * default targets): Element.animate throws a TypeError for an easing it cannot parse, as every engine does.
 */
function stubNoLinear() {
  const real = Element.prototype.animate;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, frames, timing) {
    const easing = typeof timing === 'object' ? timing.easing : undefined;
    if (easing?.startsWith('linear(')) throw new TypeError(`'${easing.slice(0, 12)}…' is not a valid value for easing`);
    return real.call(this, frames, timing);
  });
}

function stubReduced(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ matches: q.includes('reduce') ? reduce : false }) as unknown as MediaQueryList,
  );
}

const FALLBACK = `cubic-bezier(${EASE_OUT_EXPO.join(', ')})`;
const BOXES = ['outer', 'middle', 'inner'] as const;
const reveal = (c: HTMLElement) =>
  BOXES.map((n) => c.querySelector<HTMLElement>(`[data-reveal="${n}"]`)?.style.transform);
const nowAt = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-part="now-at"]')?.style.transform;
const easings = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-reveal], [data-part="now-at"]')].flatMap((el) =>
    el.getAnimations().map((a) => (a.effect as KeyframeEffect).getTiming()),
  );

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a spring move on an engine without CSS linear()', () => {
  it('a Thread rendered again with a new remaining does not throw, and every box lands where the props put it', () => {
    stubReduced(false);
    const animate = stubNoLinear();
    const { container, rerender } = render(<Thread state="active" remaining={0.72} />);
    // Where a Thread at 0.6 rests (its first render places it without a move).
    const want = render(<Thread state="active" remaining={0.6} />).container;
    expect(() => rerender(<Thread state="active" remaining={0.6} />)).not.toThrow();
    expect(reveal(container)).toEqual(reveal(want));
    expect(nowAt(container)).toBe(nowAt(want));
    expect(nowAt(container)).not.toBe(nowAt(render(<Thread state="active" remaining={0.72} />).container));
    // It still moves, on the out-expo curve, for the same length as the spring.
    expect(animate).toHaveBeenCalled();
    expect(easings(container)).not.toEqual([]);
    for (const t of easings(container)) expect(t).toMatchObject({ duration: SPRING_MS, easing: FALLBACK });
  });

  it('setRange and reset() keep the three boxes summing to zero', () => {
    stubReduced(false);
    stubNoLinear();
    const ref = createRef<RevealWindowHandle>();
    const { container } = render(
      <RevealWindow from={0} to={50} ref={ref}>
        <i />
      </RevealWindow>,
    );
    expect(() => act(() => ref.current?.setRange(30, 90))).not.toThrow();
    expect(reveal(container)).toEqual(revealTransforms(30, 90));
    expect(() => act(() => ref.current?.reset())).not.toThrow();
    expect(reveal(container)).toEqual(revealTransforms(0, 50));
  });

  it('an element that cannot animate at all jumps to where it belongs', () => {
    stubReduced(false);
    vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
      throw new TypeError('no animation here');
    });
    const ref = createRef<RevealWindowHandle>();
    const { container } = render(
      <RevealWindow from={0} to={50} ref={ref}>
        <i />
      </RevealWindow>,
    );
    expect(() => act(() => ref.current?.setRange(30, 90))).not.toThrow();
    expect(reveal(container)).toEqual(revealTransforms(30, 90));
  });

  it('asks for the out-expo curve in the first place where CSS.supports says linear() is unknown', async () => {
    vi.resetModules();
    stubReduced(false);
    const supports = vi.fn(() => false);
    vi.stubGlobal('CSS', { supports });
    const { moveTiming } = await import('../../src/motion/move');
    expect(moveTiming('spring')).toEqual({ duration: SPRING_MS, easing: FALLBACK });
    // Asked once, then remembered.
    moveTiming('spring');
    expect(supports).toHaveBeenCalledTimes(1);
    expect(supports).toHaveBeenCalledWith('transition-timing-function', 'linear(0, 1)');
  });
});
