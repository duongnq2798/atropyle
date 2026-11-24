'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ComponentProps, type MouseEvent, useEffect } from 'react';
import { withPendingViewTransition } from '@/motion/view-transition';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** `/proof` and `/proof/` are the same page (trailingSlash: true). */
function samePath(a: string, b: string): boolean {
  return (a.replace(/\/+$/, '') || '/') === (b.replace(/\/+$/, '') || '/');
}

/** A click the browser keeps for itself: another button, a modifier key, another tab. */
function isPlainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  const target = e.currentTarget.getAttribute('target');
  return (
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (target === null || target === '_self')
  );
}

/**
 * The navigation a NavLink click is waiting for. One for the whole page, not one per link: Next swaps the page and the
 * pathname in one commit, so a link inside the old page unmounts before its own effect sees the new pathname. Every
 * mounted NavLink settles it, and the header's home link is always mounted.
 */
let pending: { path: string; resolve(): void } | null = null;

/**
 * next/link whose client navigation runs inside a view transition, because React did not start one for a navigation
 * in this Next version (the spy in test/e2e/motion.spec.ts). The old picture stays until the new pathname has
 * committed, at most one second.
 */
export function NavLink({ href, onClick, ...rest }: NavLinkProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  useEffect(() => {
    const p = pending;
    if (p && samePath(p.path, pathname)) {
      pending = null;
      p.resolve();
    }
  }, [pathname]);
  return (
    <Link
      {...rest}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !isPlainClick(e)) return;
        const to = new URL(href, window.location.href);
        // Another site, or the same page (a hash change): next/link and the browser handle it.
        if (to.origin !== window.location.origin || samePath(to.pathname, window.location.pathname)) return;
        e.preventDefault();
        const committed = new Promise<void>((resolve) => {
          pending = { path: to.pathname, resolve };
        });
        withPendingViewTransition(() => router.push(href), committed);
      }}
    />
  );
}
