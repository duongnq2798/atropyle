import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusInView } from '../../src/lib/focus';

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

/** The sticky site header (shell/header.tsx), its bottom at 65 px as on a Pixel 7, and one focusable heading. */
function page(headingTop: number, headingBottom: number) {
  const header = document.createElement('header');
  header.className = 'site-header';
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(0, 65));
  const h = document.createElement('h3');
  h.tabIndex = -1;
  vi.spyOn(h, 'getBoundingClientRect').mockReturnValue(rect(headingTop, headingBottom));
  document.body.append(header, h);
  const scrollBy = vi.fn();
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
  return { h, scrollBy };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('focusInView (WCAG 2.4.11)', () => {
  it('a heading under the sticky header takes focus without a jump, then the page moves it clear', () => {
    const { h, scrollBy } = page(0, 28);
    const focus = vi.spyOn(h, 'focus');
    focusInView(h);
    expect(document.activeElement).toBe(h);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // 65 px of header and 16 px of air above it.
    expect(scrollBy).toHaveBeenCalledWith({ top: -81, behavior: 'instant' });
  });

  it('a heading in clear sight does not move the page', () => {
    const { h, scrollBy } = page(254, 282);
    focusInView(h);
    expect(document.activeElement).toBe(h);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('below the fold, it rises just enough to be seen whole', () => {
    const { h, scrollBy } = page(window.innerHeight + 10, window.innerHeight + 40);
    focusInView(h);
    expect(scrollBy).toHaveBeenCalledWith({ top: 56, behavior: 'instant' });
  });

  it('nothing to focus does nothing', () => {
    expect(() => focusInView(null)).not.toThrow();
  });
});
