'use client';

import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { ROUTES } from '@/routes';
import { WalletButton } from '@/wallet/wallet-button';
import { MobileMenu } from './mobile-menu';
import { NavLink } from './nav-link';
import { NavList } from './nav-list';
import { SettingsMenu } from './settings-menu';
import { Wordmark } from './wordmark';

/**
 * Sticky at the top. Solid below 48rem: a blur behind a sticky bar repaints every scrolled frame on a phone
 * (spec §18.4.1 item 7). `site-header` names it for View Transitions, so it stays put between pages.
 */
export function Header() {
  const t = useT(shell);
  const u = useT(ui);
  return (
    <header className="site-header sticky top-0 z-40 border-line/70 border-b bg-bg/95 md:bg-bg/80 md:backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <NavLink href={ROUTES.home} prefetch={false} aria-label={u('home')} className="-ml-1 rounded-full p-1">
          <Wordmark />
        </NavLink>
        <nav aria-label={t('navLabel')} className="ml-6 hidden md:block">
          <NavList layout="bar" />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <WalletButton />
          <div className="hidden md:block">
            <SettingsMenu />
          </div>
          <div className="md:hidden">
            <MobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
