import { act, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryKV } from '../../src/lib/store';
import { fillBase, type ProofPalette, paintRange, pixelsDone, proofGrid, readPalette } from '../../src/proof/paint';
import { ProofCanvas } from '../../src/proof/proof-canvas';
import { applyTheme } from '../../src/theme/theme';
import { renderWithProviders, TestProviders, testQueryClient } from '../helpers/render';

/** A 2D context that keeps what putImageData puts, as a browser's canvas does; happy-dom has none of its own. */
class FakeContext {
  pixels = new Uint8ClampedArray(0);
  full = 0;
  partial = 0;
  putImageData(image: ImageData, dx: number, dy: number, ...dirty: number[]): void {
    // A canvas of another size starts blank, as a resized canvas does.
    if (this.pixels.length !== image.data.length) this.pixels = new Uint8ClampedArray(image.data.length);
    const [x, y, w, h] = dirty.length === 4 ? dirty : [0, 0, image.width, image.height];
    if (dirty.length === 4) this.partial += 1;
    else this.full += 1;
    for (let row = y; row < y + h; row++) {
      const at = (row * image.width + x) * 4;
      this.pixels.set(image.data.subarray(at, at + w * 4), ((row + dy) * image.width + x + dx) * 4);
    }
  }
}

const BITS = 22; // a 256 × 256 map, 2^17 blocks
const g = proofGrid(BITS);
const night = readPalette(() => '', 'dark');
const vellum = readPalette(() => '', 'light');

/** The map of `blocks` finished blocks, painted in one go. */
function expected(blocks: number, palette: ProofPalette = night): Uint8ClampedArray {
  const data = new Uint8ClampedArray(g.size * g.size * 4);
  fillBase(data, palette);
  paintRange(data, g, palette, 0, Math.min(pixelsDone(blocks), g.perRegion));
  return data;
}

/** Bytes that differ; -1 when the sizes differ. A count, so that a failure does not print 262 144 numbers. */
function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

const map = () => screen.getByTestId('proof-canvas');
const num = (name: string) => Number(map().getAttribute(name));
const ui = (doneBlocks: number, comboBits = BITS) => (
  <ProofCanvas comboBits={comboBits} doneBlocks={doneBlocks} label="Proof map" />
);

let ctx: FakeContext;
/** True: the browser gives no 2D context (a canvas it cannot back, a blocked GPU). */
let noContext = false;

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  ctx = new FakeContext();
  noContext = false;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
    noContext ? null : (ctx as unknown as CanvasRenderingContext2D),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('ProofCanvas', () => {
  it('paints 8 dots per 16 blocks, every dot by the end, and starts again from the base for a new run', () => {
    const { rerender } = renderWithProviders(ui(0));
    expect(map()).toHaveAttribute('data-size', '256');
    expect(map()).toHaveAttribute('data-painted', '0');
    expect(ctx.full).toBe(1);
    expect(differing(ctx.pixels, expected(0))).toBe(0);
    rerender(ui(1000));
    expect(map()).toHaveAttribute('data-painted', '496');
    expect(map()).toHaveAttribute('data-done', '1000');
    rerender(ui(2 ** 17));
    expect(map()).toHaveAttribute('data-painted', '65536');
    expect(differing(ctx.pixels, expected(2 ** 17))).toBe(0);
    const generation = num('data-generation');
    rerender(ui(0));
    expect(map()).toHaveAttribute('data-painted', '0');
    expect(num('data-generation')).toBe(generation + 1);
    expect(differing(ctx.pixels, expected(0))).toBe(0);
  });

  it('puts only the new boxes on each tick, and ends with the same picture as one paint', () => {
    const { rerender } = renderWithProviders(ui(0));
    // The worker reports every 4096 blocks and its 100 ms throttle drops ticks, so the steps are uneven.
    const steps = [1000, 4096, 8192, 20_480, 24_576, 61_440, 65_536, 126_976, 2 ** 17];
    for (const done of steps) {
      rerender(ui(done));
      expect(differing(ctx.pixels, expected(done)), `after ${done} blocks`).toBe(0);
    }
    expect(ctx.full).toBe(1);
    expect(ctx.partial).toBe(steps.length * 8);
    expect(num('data-ticks')).toBe(steps.length);
    // Blocks that finish no new dot paint nothing.
    rerender(ui(2 ** 17 + 15));
    expect(ctx.partial).toBe(steps.length * 8);
    expect(num('data-ticks')).toBe(steps.length);
    expect(num('data-generation')).toBe(1);
  });

  it('repaints from the base in the new theme mid-run, keeping the progress, and the run goes on in it', () => {
    const { rerender } = renderWithProviders(ui(1000));
    expect(map()).toHaveAttribute('data-palette', 'dark');
    const generation = num('data-generation');
    act(() => applyTheme('light'));
    expect(map()).toHaveAttribute('data-palette', 'light');
    expect(map()).toHaveAttribute('data-painted', '496');
    expect(num('data-generation')).toBe(generation + 1);
    expect(ctx.full).toBe(2);
    expect(differing(ctx.pixels, expected(1000, vellum))).toBe(0);
    // The next tick puts only its boxes, in vellum.
    rerender(ui(4096));
    expect(ctx.full).toBe(2);
    expect(ctx.partial).toBe(8);
    expect(differing(ctx.pixels, expected(4096, vellum))).toBe(0);
    act(() => applyTheme('dark'));
    expect(map()).toHaveAttribute('data-palette', 'dark');
    expect(differing(ctx.pixels, expected(4096))).toBe(0);
  });

  it('paints with the theme tokens as the canvas itself computes them', () => {
    // happy-dom does not inherit custom properties, so the rule targets the canvas; e2e checks a real cascade.
    const style = document.createElement('style');
    style.textContent = '[data-testid="proof-canvas"] { --atro-alive: #010203; }';
    document.head.append(style);
    try {
      renderWithProviders(ui(16));
      expect([...ctx.pixels.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
      // The other tokens are not set here: they fall back to the values of globals.css.
      expect([...ctx.pixels.subarray(4, 8)]).toEqual([0x20, 0x25, 0x2f, 255]);
    } finally {
      style.remove();
    }
  });

  it('stops painting while the tab is hidden and catches up in one tick when it is shown again', () => {
    const { rerender } = renderWithProviders(ui(1000));
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    rerender(ui(4096));
    rerender(ui(8192));
    expect(map()).toHaveAttribute('data-painted', '496');
    expect(ctx.partial).toBe(0);
    state.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(map()).toHaveAttribute('data-painted', '4096');
    expect(num('data-ticks')).toBe(2);
    expect(differing(ctx.pixels, expected(8192))).toBe(0);
  });

  it('puts the whole map back when the browser restores a canvas it dropped', () => {
    renderWithProviders(ui(1000));
    ctx.pixels.fill(0);
    act(() => {
      map().dispatchEvent(new Event('contextrestored'));
    });
    expect(ctx.full).toBe(2);
    expect(differing(ctx.pixels, expected(1000))).toBe(0);
  });

  it('starts a new map for a new size and stops at the last dot when told more than the run holds', () => {
    const { rerender } = renderWithProviders(ui(1000));
    rerender(ui(2 ** 30, 16));
    expect(map()).toHaveAttribute('data-size', '32');
    expect(map()).toHaveAttribute('data-painted', String(8 * proofGrid(16).perRegion));
    expect(num('data-generation')).toBe(2);
    expect(ctx.pixels).toHaveLength(32 * 32 * 4);
  });

  it('still counts what it paints when the browser gives no 2D context', () => {
    noContext = true;
    const { rerender } = renderWithProviders(ui(0));
    rerender(ui(1000));
    expect(map()).toHaveAttribute('data-painted', '496');
    expect(num('data-ticks')).toBe(1);
  });

  it('is one labelled picture, and prerenders an empty map of eight regions', () => {
    renderWithProviders(ui(1000));
    expect(screen.getByRole('img', { name: 'Proof map' })).toContainElement(map());
    const html = renderToString(
      <TestProviders kv={memoryKV()} queryClient={testQueryClient()}>
        {ui(1000)}
      </TestProviders>,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Proof map"');
    expect(html).toContain('width="256"');
    expect(html.match(/data-region=/g)).toHaveLength(8);
    expect(html.match(/data-glyph=/g)).toHaveLength(5);
    // No data-painted attribute yet (the key's classes name it in a selector): the prerender shows the key.
    expect(html).not.toMatch(/\sdata-painted=/);
  });

  it('keys the five real states with their glyph, in their colour, and leaves the unused codes 2, 4 and 6 bare', () => {
    renderWithProviders(ui(0));
    const regions = [...document.querySelectorAll<HTMLElement>('[data-region]')];
    expect(regions.map((r) => r.querySelector('[data-glyph]')?.getAttribute('data-glyph') ?? null)).toEqual([
      'active',
      'grace',
      null,
      'recovery',
      null,
      'releasedInherit',
      null,
      'releasedRecover',
    ]);
    const ink = (s: number) => regions[s]?.querySelector('[data-glyph]')?.getAttribute('class') ?? '';
    expect(ink(0)).toContain('text-alive');
    expect(ink(1)).toContain('text-grace');
    expect(ink(3)).toContain('text-recovery');
    expect(ink(5)).toContain('text-release');
    expect(ink(7)).toContain('text-release');
    // The key is part of the picture, not text of its own: the wrapper's label is all a screen reader hears.
    for (const r of regions) expect(r.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
