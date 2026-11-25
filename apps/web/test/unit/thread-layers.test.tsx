import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevealWindow, type RevealWindowHandle, revealTransforms } from '../../src/motion/reveal-window';
import { SPRING_EASING, SPRING_MS } from '../../src/motion/tokens';
import type { ThreadAxis } from '../../src/thread/geometry';
import { THREAD_STATES } from '../../src/thread/state';
import { Thread, type ThreadProps } from '../../src/thread/thread';

afterEach(() => {
  vi.restoreAllMocks();
});

const AXIS: ThreadAxis = { from: 0n, to: 600n, now: 150n, alarmAt: 450n, releaseAt: 500n, marks: [60n, 120n] };
const ds = (c: HTMLElement) => [...c.querySelectorAll('path')].map((p) => p.getAttribute('d'));
const BOXES = ['outer', 'middle', 'inner'] as const;
const box = (c: HTMLElement, n: string) => c.querySelector<HTMLElement>(`[data-reveal="${n}"]`);
const reveal = (c: HTMLElement) => BOXES.map((n) => box(c, n)?.style.transform);
/** The moves running on an element, each as "from → to duration easing". */
const runs = (el: Element | null | undefined) =>
  (el?.getAnimations() ?? []).map((a) => {
    const effect = a.effect as KeyframeEffect;
    const [k0, k1] = effect.getKeyframes();
    const { duration, easing } = effect.getTiming();
    return `${k0.transform} → ${k1.transform} ${duration} ${easing}`;
  });
const spring = (from: string, to: string) => `${from} → ${to} ${SPRING_MS} ${SPRING_EASING}`;
const placed = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-part="knot"], [data-part="gate"], [data-part="dot"]')].map(
    (e) => `${e.style.left} ${e.style.top}`,
  );
/** Every state, each with all the props a page can pass. */
const EVERY: ThreadProps[] = THREAD_STATES.flatMap((state) => [
  { state, remaining: 0.3, knots: [0.2], branches: [2, 1], predicted: true, pendingKnot: true, highlight: 0 },
  { state, axis: AXIS, branches: [2, 1] },
]);

let renders = 0;
/** Counts the renders of the RevealWindow's children. */
function Count() {
  renders++;
  return null;
}

function stubReduced(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ matches: q.includes('reduce') ? reduce : false }) as unknown as MediaQueryList,
  );
}

describe('Thread layers (R18.4)', () => {
  it('animates only root svgs: no animate-* class on anything inside an svg', () => {
    for (const props of EVERY) {
      const { container, unmount } = render(<Thread {...props} />);
      for (const el of container.querySelectorAll('svg *')) {
        expect(el.getAttribute('class') ?? '', `${props.state} ${el.tagName}`).not.toMatch(/animate-/);
      }
      unmount();
    }
    const { container } = render(
      <>
        <Thread state="active" remaining={0.05} />
        <Thread state="grace" remaining={0.5} />
      </>,
    );
    const glow = container.querySelector('svg[data-layer="glow"]');
    expect(glow?.getAttribute('class')).toContain('motion-safe:animate-thread-pulse-fast');
    expect(glow?.parentElement?.closest('svg')).toBeNull();
    const tremble = container.querySelector('[data-state="grace"] svg[data-layer="lit"]');
    expect(tremble?.getAttribute('class')).toContain('motion-safe:animate-thread-tremble');
    expect(tremble?.parentElement?.closest('svg')).toBeNull();
  });

  it('a new remaining moves the window and "now", and no path', () => {
    const { container, rerender } = render(<Thread state="active" remaining={0.5} knots={[0.1, 0.3]} />);
    const before = { d: ds(container), reveal: reveal(container), placed: placed(container) };
    expect(before.reveal).toEqual(['translateX(50%)', 'translateX(-50%)', 'translateX(0%)']);
    rerender(<Thread state="active" remaining={0.25} knots={[0.1, 0.3]} />);
    expect(ds(container)).toEqual(before.d);
    expect(placed(container)).toEqual(before.placed);
    expect(reveal(container)).toEqual(['translateX(75%)', 'translateX(-75%)', 'translateX(0%)']);
    expect(container.querySelector<HTMLElement>('[data-part="now-at"]')?.style.transform).toMatch(/^translate\(75%, /);
  });

  it('"now" moves on the clock and the curve of the window, and no CSS transition moves it', () => {
    stubReduced(false);
    const { container, rerender } = render(<Thread state="active" remaining={0.5} />);
    const nowAt = container.querySelector<HTMLElement>('[data-part="now-at"]');
    const before = nowAt?.style.transform ?? '';
    expect(nowAt?.getAttribute('class')).not.toMatch(/transition|duration-|ease-/);
    expect(runs(nowAt)).toEqual([]);
    rerender(<Thread state="active" remaining={0.25} />);
    const after = nowAt?.style.transform ?? '';
    expect(after).toMatch(/^translate\(75%, /);
    expect(runs(nowAt)).toEqual([spring(before, after)]);
    expect(runs(box(container, 'outer'))).toEqual([spring('translateX(50%)', 'translateX(75%)')]);
  });

  it('a render with the same props keeps the window where setRange put it, and reset() takes it back', () => {
    stubReduced(false);
    const ref = createRef<RevealWindowHandle>();
    const { container, rerender } = render(<Thread state="active" remaining={0.5} revealRef={ref} />);
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-50%)', 'translateX(0%)']);
    act(() => ref.current?.setRange(0, 100, { linear: 600 }));
    rerender(<Thread state="active" remaining={0.5} revealRef={ref} />);
    expect(reveal(container)).toEqual(['translateX(0%)', 'translateX(0%)', 'translateX(0%)']);
    // An early release, or a wallet that says no: nothing was tied, so the thread goes back to what it was.
    act(() => ref.current?.reset());
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-50%)', 'translateX(0%)']);
  });

  it('a new axis.now moves the window and "now", and no path', () => {
    const { container, rerender } = render(<Thread state="active" axis={AXIS} />);
    const before = { d: ds(container), reveal: reveal(container), placed: placed(container) };
    expect(before.reveal).toEqual(['translateX(25%)', 'translateX(-50%)', 'translateX(25%)']);
    rerender(<Thread state="active" axis={{ ...AXIS, now: 300n }} />);
    expect(ds(container)).toEqual(before.d);
    expect(placed(container)).toEqual(before.placed);
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-75%)', 'translateX(25%)']);
  });

  it('setRange moves only the window: "now", the pending knot and the marks stay where the props put them', () => {
    const ref = createRef<RevealWindowHandle>();
    const { container } = render(<Thread state="active" axis={AXIS} pendingKnot revealRef={ref} />);
    const nowAt = container.querySelector<HTMLElement>('[data-part="now-at"]');
    const before = { now: nowAt?.style.transform, placed: placed(container) };
    expect(before.now).toMatch(/^translate\(25%, /);
    act(() => ref.current?.setRange(50, 75, 'instant'));
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-75%)', 'translateX(25%)']);
    expect(nowAt?.style.transform).toBe(before.now);
    expect(nowAt?.querySelector('[data-part="pending"]')).not.toBeNull();
    expect(placed(container)).toEqual(before.placed);
  });

  it('has no filter and no drop-shadow, and nothing round inside an svg (it would stretch)', () => {
    for (const props of EVERY) {
      const { container, unmount } = render(<Thread {...props} />);
      expect(container.querySelectorAll('filter, circle, ellipse'), props.state).toHaveLength(0);
      for (const el of container.querySelectorAll('*')) {
        expect(el.hasAttribute('filter'), props.state).toBe(false);
        expect(el.getAttribute('class') ?? '', props.state).not.toMatch(/drop-shadow|blur|filter/);
        expect(el.getAttribute('style') ?? '', props.state).not.toMatch(/filter/);
      }
      unmount();
    }
  });

  it('stretches every svg to the box and keeps every stroke width', () => {
    for (const props of EVERY) {
      const { container, unmount } = render(<Thread {...props} />);
      expect(container.querySelectorAll('svg').length, props.state).toBeGreaterThanOrEqual(2);
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg.getAttribute('preserveAspectRatio'), props.state).toBe('none');
      }
      for (const p of container.querySelectorAll('path')) {
        expect(p.getAttribute('vector-effect'), `${props.state} ${p.getAttribute('data-part')}`).toBe(
          'non-scaling-stroke',
        );
      }
      unmount();
    }
  });

  it('clips its layers at the root', () => {
    const { container } = render(<Thread state="releasedInherit" branches={[1, 1]} />);
    const root = container.querySelector('[data-thread]');
    expect(root?.getAttribute('class')?.split(/\s+/)).toEqual(expect.arrayContaining(['relative', 'overflow-clip']));
    expect(
      [...(root?.children ?? [])].map((e) => e.getAttribute('data-layer') ?? e.getAttribute('data-reveal')),
    ).toEqual(['base', 'outer', 'marks']);
  });

  it('gives predicted, pendingKnot and highlight each its own data attribute', () => {
    const plain = render(<Thread state="releasedInherit" branches={[5000, 3000, 2000]} />).container;
    const root = plain.querySelector('[data-thread]');
    for (const a of ['data-predicted', 'data-pending-knot', 'data-highlight'])
      expect(root?.hasAttribute(a), a).toBe(false);
    expect(plain.querySelector('[data-layer="marks"]')?.hasAttribute('data-highlight')).toBe(false);
    expect(plain.querySelector('[stroke-dasharray="5 5"]')).toBeNull();

    const told = render(
      <Thread state="releasedInherit" branches={[5000, 3000, 2000]} predicted highlight={1} />,
    ).container;
    const r = told.querySelector('[data-thread]');
    expect(r?.getAttribute('data-predicted')).toBe('true');
    expect(r?.getAttribute('data-highlight')).toBe('1');
    expect(told.querySelector('[data-layer="marks"]')?.getAttribute('data-highlight')).toBe('1');
    const branches = [...told.querySelectorAll('[data-part="branch"]')];
    for (const b of branches) expect(b.getAttribute('stroke-dasharray')).toBe('5 5');
    expect(branches[1].getAttribute('class')).toBe('stroke-thread');
    for (const i of [0, 2]) {
      expect(branches[i].getAttribute('class')).toBe('stroke-ink-muted');
      expect(branches[i].getAttribute('stroke-opacity')).toBe('0.35');
    }
    expect([...told.querySelectorAll('[data-part="dot"]')].map((d) => d.getAttribute('data-tone'))).toEqual([
      'muted',
      'highlight',
      'muted',
    ]);
    // The same paths: predicted and highlight change the style only.
    expect(ds(told)).toEqual(ds(plain));

    // data-highlight follows the prop in every state, on the root and on the marks; the styling needs a branch.
    for (const props of [
      { state: 'active', remaining: 0.5, highlight: 2 },
      { state: 'releasedInherit', branches: [1, 1], highlight: 2 },
    ] as ThreadProps[]) {
      const c = render(<Thread {...props} />).container;
      expect(c.querySelector('[data-thread]')?.getAttribute('data-highlight'), props.state).toBe('2');
      expect(c.querySelector('[data-layer="marks"]')?.getAttribute('data-highlight'), props.state).toBe('2');
      expect(c.querySelectorAll('[data-tone="highlight"], [data-tone="muted"]'), props.state).toHaveLength(0);
    }

    const grace = render(<Thread state="grace" remaining={0.5} predicted />).container;
    const fibers = grace.querySelectorAll('[data-part="fiber"], [data-part="fiber-course"]');
    expect(fibers).toHaveLength(6);
    for (const f of fibers) expect(f.getAttribute('stroke-dasharray')).toBe('5 5');

    const tying = render(<Thread state="active" remaining={0.5} pendingKnot />).container;
    expect(tying.querySelector('[data-thread]')?.getAttribute('data-pending-knot')).toBe('true');
    expect(tying.querySelectorAll('[data-part="now-at"] [data-part="pending"]')).toHaveLength(1);
  });

  it('beats faster as the deadline nears, and only while active', () => {
    const beat = (props: ThreadProps) =>
      render(<Thread {...props} />)
        .container.querySelector('svg[data-layer="glow"]')
        ?.getAttribute('data-beat') ?? null;
    expect(beat({ state: 'active', remaining: 0.8 })).toBe('slow');
    expect(beat({ state: 'active', remaining: 0.3 })).toBe('mid');
    expect(beat({ state: 'active', remaining: 0.05 })).toBe('fast');
    expect(beat({ state: 'grace', remaining: 0.05 })).toBeNull();
    expect(beat({ state: 'releasedInherit' })).toBeNull();
    // A new beat starts a fresh loop: a new glow, so its opacity does not cut halfway through a beat.
    const { container, rerender } = render(<Thread state="active" remaining={0.8} />);
    const slow = container.querySelector('svg[data-layer="glow"]');
    rerender(<Thread state="active" remaining={0.79} />);
    expect(container.querySelector('svg[data-layer="glow"]')).toBe(slow);
    rerender(<Thread state="active" remaining={0.3} />);
    expect(container.querySelector('svg[data-layer="glow"]')).not.toBe(slow);
    expect(container.querySelector('svg[data-layer="glow"]')?.getAttribute('data-beat')).toBe('mid');
  });

  it('places the gate, its posts slot, the knots and the dots in percent of the box', () => {
    const { container } = render(
      <Thread state="releasedInherit" axis={{ ...AXIS, releaseAt: 300n }} branches={[1, 1]} />,
    );
    const gate = container.querySelector<HTMLElement>('[data-part="gate"]');
    expect([gate?.style.left, gate?.style.top]).toEqual(['50%', '42.5%']);
    expect(gate?.querySelector('[data-part="arch"]')).not.toBeNull();
    const knots = [...container.querySelectorAll<HTMLElement>('[data-part="knot"]')].map((k) => k.style.left);
    expect(knots).toEqual(['10%', '20%']);
    const dots = [...container.querySelectorAll<HTMLElement>('[data-part="dot"]')].map((d) => d.style.left);
    expect(dots).toEqual(['99%', '99%']);
  });

  it('prerenders the window where it rests, so the first paint is the final layout', () => {
    const html = renderToString(<Thread state="active" remaining={0.5} />);
    expect(html).toContain('transform:translateX(50%)');
    expect(html).toContain('data-beat="mid"');
  });
});

describe('RevealWindow', () => {
  it('shows [from, to] in place: three translations that sum to zero', () => {
    for (const [a, b] of [
      [0, 100],
      [25, 75],
      [12.5, 12.5],
      [80, 20],
      [-10, 140],
    ]) {
      const t = revealTransforms(a, b).map((s) => Number(/-?[\d.]+/.exec(s)?.[0]));
      expect(t[0] + t[1] + t[2], `${a} ${b}`).toBeCloseTo(0, 9);
    }
    expect(revealTransforms(25, 75)).toEqual(['translateX(25%)', 'translateX(-50%)', 'translateX(25%)']);
    expect(revealTransforms(80, 20)).toEqual(['translateX(80%)', 'translateX(-100%)', 'translateX(20%)']);
    expect(revealTransforms(-10, 140)).toEqual(['translateX(0%)', 'translateX(0%)', 'translateX(0%)']);
    expect(revealTransforms(Number.NaN, 50)).toEqual(['translateX(0%)', 'translateX(-50%)', 'translateX(50%)']);
  });

  it('moves with the spring, by the Web Animations API, and never by a CSS transition', () => {
    stubReduced(false);
    const ui = (from: number, to: number) => (
      <RevealWindow from={from} to={to}>
        <i />
      </RevealWindow>
    );
    const { container, rerender } = render(ui(10, 90));
    for (const n of BOXES) {
      // A CSS transition would outrank the animation, and would run each box on its own clock.
      expect(box(container, n)?.getAttribute('class'), n).not.toMatch(/transition|duration-|ease-/);
      expect(box(container, n)?.style.transition, n).toBe('');
    }
    rerender(ui(20, 80));
    const [before, after] = [revealTransforms(10, 90), revealTransforms(20, 80)];
    expect(BOXES.map((n) => runs(box(container, n)))).toEqual(BOXES.map((_, i) => [spring(before[i], after[i])]));
  });

  it('setRange moves the window without a React render, and the next props take it back', () => {
    stubReduced(false);
    const ref = createRef<RevealWindowHandle>();
    const { container, rerender } = render(
      <RevealWindow from={0} to={100} ref={ref}>
        <Count />
      </RevealWindow>,
    );
    const seen = renders;
    const outer = box(container, 'outer');
    act(() => ref.current?.setRange(30, 60, 'instant'));
    expect(renders).toBe(seen);
    expect(reveal(container)).toEqual(['translateX(30%)', 'translateX(-70%)', 'translateX(40%)']);
    expect(runs(outer)).toEqual([]);
    act(() => ref.current?.setRange(30, 100, { linear: 600 }));
    // The outer box rests where it is; the two that move run the same straight line.
    expect(runs(outer)).toEqual([]);
    expect(runs(box(container, 'middle'))).toEqual(['translateX(-70%) → translateX(-30%) 600 linear']);
    expect(runs(box(container, 'inner'))).toEqual(['translateX(40%) → translateX(0%) 600 linear']);
    act(() => ref.current?.setRange(40, 60));
    expect(runs(outer)).toEqual([spring('translateX(30%)', 'translateX(40%)')]);
    rerender(
      <RevealWindow from={50} to={100} ref={ref}>
        <Count />
      </RevealWindow>,
    );
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-50%)', 'translateX(0%)']);
    expect(runs(outer)).toEqual([spring('translateX(40%)', 'translateX(50%)')]);
    expect(outer?.style.transition).toBe('');
  });

  it('keeps a setRange through a render with the same props, until reset() takes it back', () => {
    stubReduced(false);
    const ref = createRef<RevealWindowHandle>();
    const ui = (
      <RevealWindow from={30} to={60} ref={ref}>
        <i />
      </RevealWindow>
    );
    const { container, rerender } = render(ui);
    act(() => ref.current?.setRange(30, 100, { linear: 1200 }));
    // An unrelated render (a chain-now tick) must not cut a drag or a hold short.
    rerender(ui);
    expect(reveal(container)).toEqual(revealTransforms(30, 100));
    act(() => ref.current?.reset());
    const [held, rest] = [revealTransforms(30, 100), revealTransforms(30, 60)];
    expect(reveal(container)).toEqual(rest);
    // The outer box never left 30 %; the other two spring back from where the hold had them.
    expect(BOXES.map((n) => runs(box(container, n)))).toEqual([
      [],
      [spring(held[1], rest[1])],
      [spring(held[2], rest[2])],
    ]);
    act(() => ref.current?.setRange(0, 100, 'instant'));
    act(() => ref.current?.reset('instant'));
    expect(reveal(container)).toEqual(rest);
    expect(BOXES.flatMap((n) => runs(box(container, n)))).toEqual([]);
  });

  it('starts every box of a move together, also when it cuts into a move still running', () => {
    stubReduced(false);
    const ref = createRef<RevealWindowHandle>();
    const ui = (from: number, to: number) => (
      <RevealWindow from={from} to={to} ref={ref}>
        <i />
      </RevealWindow>
    );
    const { container, rerender } = render(ui(25, 75));
    // The first render is where the prerender put it: nothing moves.
    expect(BOXES.flatMap((n) => runs(box(container, n)))).toEqual([]);
    rerender(ui(25, 83));
    // Only `to` moved: the outer box rests at its value and does not move.
    expect(runs(box(container, 'outer'))).toEqual([]);
    const first = BOXES.map((n) => box(container, n)?.getAnimations()[0]);
    // Then only `from` moves, while the inner box still runs towards the same value: it restarts with the others.
    rerender(ui(30, 83));
    const second = BOXES.map((n) => box(container, n)?.getAnimations() ?? []);
    for (const a of first) if (a) expect(a.playState).toBe('idle');
    expect(second.map((a) => a.length)).toEqual([1, 1, 1]);
    // One curve for all three (that they share one start time is the browser check's to prove).
    const timing = second.map(([a]) => {
      const { duration, easing } = (a.effect as KeyframeEffect).getTiming();
      return { duration, easing };
    });
    expect(timing).toEqual(BOXES.map(() => ({ duration: SPRING_MS, easing: SPRING_EASING })));
    expect(runs(box(container, 'inner'))).toEqual([spring('translateX(17%)', 'translateX(17%)')]);
  });

  it('jumps under reduced motion, whatever the move asks', () => {
    stubReduced(true);
    const ref = createRef<RevealWindowHandle>();
    const ui = (from: number, to: number) => (
      <RevealWindow from={from} to={to} ref={ref}>
        <i />
      </RevealWindow>
    );
    const { container, rerender } = render(ui(0, 100));
    act(() => ref.current?.setRange(20, 80, { linear: 600 }));
    expect(reveal(container)).toEqual(revealTransforms(20, 80));
    act(() => ref.current?.setRange(10, 80));
    act(() => ref.current?.reset());
    rerender(ui(40, 60));
    expect(reveal(container)).toEqual(revealTransforms(40, 60));
    expect(BOXES.flatMap((n) => runs(box(container, n)))).toEqual([]);
  });

  it('a linear move of no length, or of no number, jumps', () => {
    stubReduced(false);
    const ref = createRef<RevealWindowHandle>();
    const { container } = render(
      <RevealWindow from={0} to={100} ref={ref}>
        <i />
      </RevealWindow>,
    );
    for (const linear of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
      act(() => ref.current?.setRange(20, 80, { linear }));
      expect(reveal(container), String(linear)).toEqual(revealTransforms(20, 80));
      expect(box(container, 'outer')?.style.transition ?? '', String(linear)).not.toMatch(/NaN|Infinity/);
      expect(
        BOXES.flatMap((n) => runs(box(container, n))),
        String(linear),
      ).toEqual([]);
      act(() => ref.current?.setRange(0, 100, 'instant'));
    }
  });
});
