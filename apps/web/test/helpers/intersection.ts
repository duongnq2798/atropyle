import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** An IntersectionObserver the test drives: happy-dom's never calls back. */
export class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  unobserve(el: Element): void {
    this.targets.delete(el);
  }
  disconnect(): void {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/**
 * Puts FakeObserver in place of IntersectionObserver (vi.unstubAllGlobals takes it out) and returns `show`, which tells
 * every observer of `el` whether it is on screen, as the browser does after a scroll.
 */
export function stubIntersection(): (el: Element, on: boolean) => void {
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return (el, on) => {
    act(() => {
      for (const o of FakeObserver.all) {
        if (!o.targets.has(el)) continue;
        const entry = { target: el, isIntersecting: on } as unknown as IntersectionObserverEntry;
        o.callback([entry], o as unknown as IntersectionObserver);
      }
    });
  };
}
