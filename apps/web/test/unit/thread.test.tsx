import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { memoryKV } from '../../src/lib/store';
import { MotionProvider } from '../../src/motion/provider';
import { GLYPH_NAMES, StateGlyph } from '../../src/thread/glyphs';
import { THREAD_STATES } from '../../src/thread/state';
import { StateBadge } from '../../src/thread/state-badge';
import { Thread } from '../../src/thread/thread';
import { renderWithProviders } from '../helpers/render';

// The real SharedThread, inside a marker: React's ViewTransition itself leaves nothing in the DOM to look for.
vi.mock('../../src/motion/view-transition', async (load) => {
  const real = await load<typeof import('../../src/motion/view-transition')>();
  return {
    ...real,
    SharedThread: ({ children }: { children: ReactNode }) => (
      <div data-testid="shared-thread">
        <real.SharedThread>{children}</real.SharedThread>
      </div>
    ),
  };
});

const parts = (c: HTMLElement, part: string) => c.querySelectorAll(`[data-part="${part}"]`);
const root = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-thread]');

describe('Thread', () => {
  it('is decorative unless it has a label', () => {
    const { container } = renderWithProviders(<Thread state="active" />);
    expect(root(container)?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
    for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
    // It never takes a pointer: a drag handle laid over it (the Scrubber of Plan 7B) gets every event.
    expect(root(container)?.getAttribute('class')?.split(/\s+/)).toContain('pointer-events-none');
  });

  it('morphs into the next page only when shared', () => {
    const { container, unmount } = renderWithProviders(<Thread state="active" />);
    expect(container.querySelector('[data-testid="shared-thread"]')).toBeNull();
    unmount();
    const shared = renderWithProviders(<Thread state="active" shared />).container;
    expect(shared.querySelector('[data-testid="shared-thread"] > [data-thread]')).not.toBeNull();
  });

  it('carries a label as an image when given one', () => {
    renderWithProviders(<Thread state="grace" label="Vault thread: Grace period" />);
    const img = screen.getByRole('img', { name: 'Vault thread: Grace period' });
    expect(img.hasAttribute('data-thread')).toBe(true);
    expect(img.hasAttribute('aria-hidden')).toBe(false);
  });

  it('draws the lit part, the "now" point and the knots of an active vault, in the thread colour', () => {
    const { container } = renderWithProviders(<Thread state="active" remaining={0.5} knots={[0.1, 0.3]} />);
    expect(root(container)?.getAttribute('data-state')).toBe('active');
    expect(root(container)?.getAttribute('class')).toContain('text-thread');
    expect(parts(container, 'lit')).toHaveLength(1);
    expect(parts(container, 'now')).toHaveLength(1);
    expect(parts(container, 'knot')).toHaveLength(2);
    expect(parts(container, 'lit')[0].getAttribute('d')).toMatch(/^M0 60 /);
    expect(container.querySelector<HTMLElement>('[data-reveal="outer"]')?.style.transform).toBe('translateX(50%)');
  });

  it('splits into one branch per heir, thicker for a larger share, through an HTML gate', () => {
    const { container } = renderWithProviders(<Thread state="releasedInherit" branches={[5000, 3000, 2000]} />);
    const b = parts(container, 'branch');
    expect(b).toHaveLength(3);
    expect(parts(container, 'gate')).toHaveLength(1);
    expect(parts(container, 'gate')[0].tagName).toBe('SPAN');
    expect(parts(container, 'dot')).toHaveLength(3);
    const widths = [...b].map((p) => Number(p.getAttribute('stroke-width')));
    expect(widths[0]).toBeGreaterThan(widths[2]);
  });

  it('curls an expired Drill up and shows no "now"', () => {
    const { container } = renderWithProviders(<Thread state="expired" />);
    expect(parts(container, 'curl')).toHaveLength(1);
    expect(parts(container, 'now')).toHaveLength(0);
    expect(root(container)?.getAttribute('class')).toContain('text-ink-muted');
  });

  it('moves only behind motion-safe: the pulse and the tremble never run under reduced motion', () => {
    const { container } = renderWithProviders(
      <>
        <Thread state="active" />
        <Thread state="grace" />
      </>,
    );
    const classes = [...container.querySelectorAll('[class]')].flatMap((e) =>
      (e.getAttribute('class') ?? '').split(/\s+/),
    );
    expect(classes).toContain('motion-safe:animate-thread-pulse');
    expect(classes).toContain('motion-safe:animate-thread-tremble');
    expect(classes.filter((c) => /^(?:transition|animate-|duration-|ease-)/.test(c))).toEqual([]);
  });

  it('is 5:1 unless the caller sets a height', () => {
    const { container } = renderWithProviders(<Thread state="active" className="h-20 w-full" />);
    const cls = root(container)?.getAttribute('class') ?? '';
    expect(cls).toContain('aspect-[5/1]');
    expect(cls).toContain('h-20 w-full');
  });

  it('renders every state', () => {
    for (const s of THREAD_STATES) {
      const { container, unmount } = renderWithProviders(<Thread state={s} remaining={0.4} branches={[1, 2]} />);
      expect(container.querySelector(`[data-thread][data-state="${s}"]`), s).not.toBeNull();
      unmount();
    }
  });
});

describe('StateGlyph', () => {
  it('draws eight distinct glyphs, hidden from assistive technology, in the current colour', () => {
    const seen = new Set<string>();
    for (const name of GLYPH_NAMES) {
      const { container, unmount } = renderWithProviders(<StateGlyph name={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg?.getAttribute('stroke'), name).toBe('currentColor');
      expect(svg?.getAttribute('stroke-width'), name).toBe('1.5');
      for (const p of container.querySelectorAll('path'))
        expect(p.getAttribute('d'), name).toMatch(/^M[0-9.\- a-zA-Z]+$/);
      seen.add(svg?.innerHTML ?? '');
      unmount();
    }
    expect(seen.size).toBe(GLYPH_NAMES.length);
  });
});

describe('StateBadge', () => {
  it('names every state in words next to its glyph (colour is never the only signal)', () => {
    const want = {
      active: 'Active',
      grace: 'Grace period',
      recovery: 'Recovery pending',
      releasedInherit: 'Released to heirs',
      releasedRecover: 'Released to the recovery wallet',
      expired: 'Drill expired',
    } as const;
    for (const s of THREAD_STATES) {
      const { container, unmount } = renderWithProviders(<StateBadge state={s} />);
      expect(screen.getByText(want[s])).toBeTruthy();
      expect(container.querySelector(`[data-state="${s}"] svg[data-glyph]`), s).not.toBeNull();
      unmount();
    }
  });

  it('uses the alive colour for an active vault, in two sizes', () => {
    const { container } = renderWithProviders(<StateBadge state="active" />);
    expect(container.querySelector('[data-state="active"]')?.getAttribute('class')).toContain('text-alive');
    expect(container.querySelector('[data-state="active"]')?.getAttribute('class')).toContain('h-8');
    const sm = renderWithProviders(<StateBadge state="grace" size="sm" />).container;
    expect(sm.querySelector('[data-state="grace"]')?.getAttribute('class')?.split(/\s+/)).toContain('h-6');
  });

  it('prerenders its words visible: only a later change of state enters', () => {
    const html = renderToString(
      <KVProvider kv={memoryKV()}>
        <LangProvider>
          <MotionProvider>
            <StateBadge state="grace" />
          </MotionProvider>
        </LangProvider>
      </KVProvider>,
    );
    expect(html).toContain('Grace period');
    expect(html).not.toMatch(/opacity:\s*0[;"]/);
    expect(html).not.toMatch(/translateY\(5px\)/);
  });

  it('speaks Vietnamese', async () => {
    renderWithProviders(<StateBadge state="grace" />, { lang: 'vi' });
    await waitFor(() => expect(screen.getByText('Thời gian ân hạn')).toBeTruthy());
  });

  it('marks a Drill and announces changes when live', () => {
    const { container } = renderWithProviders(<StateBadge state="active" drill live />);
    expect(screen.getByText('Drill')).toBeTruthy();
    expect(container.querySelector('[data-state="active"]')?.getAttribute('aria-live')).toBe('polite');
  });
});
