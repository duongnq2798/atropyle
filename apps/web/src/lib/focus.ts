/** Air between a focused element and what covers the page's edge (the sticky header, a fixed dock). */
const AIR = 16;

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The band of the viewport where a focused element is seen whole: below the sticky site header (shell/header.tsx)
 * and inside the root's scroll padding (a page with a fixed dock sets it, globals.css).
 */
function clearBand(): { top: number; bottom: number } {
  const root = getComputedStyle(document.documentElement);
  const header = document.querySelector('header.site-header');
  const below = header ? header.getBoundingClientRect().bottom + AIR : 0;
  return {
    top: Math.max(below, px(root.scrollPaddingTop)),
    bottom: window.innerHeight - Math.max(AIR, px(root.scrollPaddingBottom)),
  };
}

/**
 * Moves focus to `el` and keeps it in sight (WCAG 2.2 2.4.11, Focus Not Obscured). A bare focus() scrolls only an
 * element outside the viewport: one that is "in view" under the sticky header stays hidden there. So the focus does
 * not scroll, and the page then moves by exactly what hides the element, no more.
 */
export function focusInView(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  const r = el.getBoundingClientRect();
  const band = clearBand();
  let by = 0;
  if (r.top < band.top) by = r.top - band.top;
  // Below the band: up just enough to show its end, never so far that its start goes under the header.
  else if (r.bottom > band.bottom) by = Math.min(r.bottom - band.bottom, r.top - band.top);
  if (by !== 0) window.scrollBy({ top: by, behavior: 'instant' });
}
