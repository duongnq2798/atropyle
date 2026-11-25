'use client';

import { ChevronRight } from 'lucide-react';
import * as m from 'motion/react-m';
import { usePathname, useSelectedLayoutSegment } from 'next/navigation';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as shell } from '@/messages/shell.messages';
import { SPRING } from '@/motion/tokens';
import { isCurrent, NAV, ROUTES } from '@/routes';
import { NavLink } from './nav-link';

/** The segment Next gives the root not-found page (next/dist/shared/lib/segment.js, NOT_FOUND_SEGMENT_KEY). */
const NOT_FOUND_SEGMENT = '/_not-found';

/**
 * The main navigation. `bar`: one row in the header, a thread under the current page that slides to the next one.
 * `sheet`: large rows in the mobile menu. Quyết định 22: no prefetch until every target route exists.
 */
export function NavList({ layout, onNavigate }: { layout: 'bar' | 'sheet'; onNavigate?(): void }) {
  const t = useT(shell);
  const pathname = usePathname() ?? '/';
  // 404.html is prerendered once and served for every missing path, so its pathname differs between the HTML and
  // hydration; its segment comes from the router tree in the page and does not. A missing page is no page of the nav.
  const notFound = useSelectedLayoutSegment() === NOT_FOUND_SEGMENT;
  return (
    <ul className={layout === 'bar' ? 'flex items-center gap-1' : 'flex flex-col'}>
      {NAV.map((item) => {
        const href = ROUTES[item.route];
        const current = !notFound && isCurrent(pathname, href);
        return (
          <li key={item.route}>
            <NavLink
              href={href}
              prefetch={false}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'transition-colors duration-150',
                layout === 'bar'
                  ? 'relative block rounded-full px-3 py-2 text-small'
                  : 'flex h-12 items-center justify-between rounded-xl px-3 font-display text-title hover:bg-surface-2',
                current ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {t(item.key)}
              {layout === 'bar' && current ? (
                <m.span
                  layoutId="nav-thread"
                  transition={SPRING}
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-thread"
                />
              ) : null}
              {layout === 'sheet' ? (
                <ChevronRight aria-hidden="true" size={18} strokeWidth={1.5} className="text-ink-muted" />
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}
