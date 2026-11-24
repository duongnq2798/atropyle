import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavLink } from '../../src/shell/nav-link';

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn<(href: string) => void>() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }));

/** The update callbacks handed to the fake document.startViewTransition, in call order. */
const updates: (() => Promise<void>)[] = [];

beforeEach(() => {
  nav.pathname = '/';
  nav.push.mockClear();
  updates.length = 0;
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => Promise<void>) => {
      updates.push(update);
      return {};
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('NavLink', () => {
  it('runs a plain click as a client navigation in a view transition that waits for the new route', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { rerender } = render(<NavLink href="/proof/">Proof</NavLink>);
    const link = screen.getByRole('link', { name: 'Proof' });
    const click = createEvent.click(link);
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(updates).toHaveLength(1);
    let done = false;
    const finished = updates[0]().then(() => {
      done = true;
    });
    expect(nav.push).toHaveBeenCalledWith('/proof/');
    await Promise.resolve();
    expect(done).toBe(false);
    // usePathname may report the route without its trailing slash; it is the same page.
    nav.pathname = '/proof';
    rerender(<NavLink href="/proof/">Proof</NavLink>);
    await finished;
    expect(done).toBe(true);
  });

  it('lets the new picture in as soon as the route commits, also when the clicked link leaves with the old page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    // The header's home link stays; the in-page link goes with the old page, in the commit that changes the pathname.
    const { rerender } = render(
      <>
        <NavLink href="/">Home</NavLink>
        <NavLink href="/proof/">Proof</NavLink>
      </>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Proof' }));
    expect(updates).toHaveLength(1);
    let done = false;
    const finished = updates[0]().then(() => {
      done = true;
    });
    nav.pathname = '/proof/';
    rerender(<NavLink href="/">Home</NavLink>);
    await act(async () => {});
    expect(done).toBe(true);
    await finished;
  });

  it('stops holding the old picture after one second, so a failed navigation never freezes the page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    render(<NavLink href="/proof/">Proof</NavLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Proof' }));
    let done = false;
    const finished = updates[0]().then(() => {
      done = true;
    });
    vi.advanceTimersByTime(999);
    await Promise.resolve();
    expect(done).toBe(false);
    vi.advanceTimersByTime(1);
    await finished;
    expect(done).toBe(true);
  });

  it('leaves modified clicks and links to the current page to the browser and next/link', () => {
    render(
      <>
        <NavLink href="/proof/">Proof</NavLink>
        <NavLink href="/">Home</NavLink>
      </>,
    );
    const prevented: boolean[] = [];
    // React handles the click at its root; this listener on window runs after it and stops happy-dom navigating.
    const guard = (e: Event) => {
      prevented.push(e.defaultPrevented);
      e.preventDefault();
    };
    window.addEventListener('click', guard);
    fireEvent.click(screen.getByRole('link', { name: 'Proof' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    window.removeEventListener('click', guard);
    expect(prevented).toEqual([false, false]);
    expect(updates).toHaveLength(0);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('keeps the view transition under reduced motion, which globals.css turns into a 120 ms crossfade', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    );
    render(<NavLink href="/proof/">Proof</NavLink>);
    const link = screen.getByRole('link', { name: 'Proof' });
    const click = createEvent.click(link);
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(updates).toHaveLength(1);
    void updates[0]();
    expect(nav.push).toHaveBeenCalledWith('/proof/');
  });
});
