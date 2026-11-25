'use client';

import { ENV, IS_VERCEL } from '@/config/env';
import { useT } from '@/i18n/provider';
import { LICENSE_URL, REPO_URL, XLAYER_URL } from '@/lib/links';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { LIMITS_HREF, ROUTES } from '@/routes';
import { ExternalLink } from '@/ui/external-link';
import { NavLink } from './nav-link';
import { Wordmark } from './wordmark';

const LINK = 'text-ink-muted transition-colors duration-150 hover:text-ink';

/**
 * The known limits instead of a beta badge (R18.7), the page for heirs and guardians, and what the site never
 * collects. Task 15's e2e blocks every third-party request, which keeps "No trackers · No cookies" true.
 */
export function Footer() {
  const t = useT(shell);
  const u = useT(ui);
  return (
    <footer className="site-footer border-line border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="flex max-w-md flex-col items-start gap-3">
            <Wordmark />
            <p className="text-ink-muted text-small">{t('footer')}</p>
            <NavLink
              href={LIMITS_HREF}
              className="rounded-sm font-medium text-small text-thread underline decoration-thread/40 underline-offset-4 transition-colors duration-150 hover:decoration-thread"
            >
              {t('knownLimits')}
            </NavLink>
          </div>
          <nav aria-label={t('footerNav')}>
            <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-small">
              <li>
                <NavLink href={ROUTES.verify} prefetch={false} className={LINK}>
                  {t('forHeirs')}
                </NavLink>
              </li>
              <li>
                <ExternalLink href={REPO_URL} className={LINK}>
                  {u('footerSource')}
                </ExternalLink>
              </li>
              <li>
                <NavLink href={ROUTES.status} prefetch={false} className={LINK}>
                  {t('navStatus')}
                </NavLink>
              </li>
              <li>
                <ExternalLink href={XLAYER_URL} className={LINK}>
                  {u('footerXLayer')}
                </ExternalLink>
              </li>
              <li>
                <NavLink href={ROUTES.developers} prefetch={false} className={LINK}>
                  {t('navDevelopers')}
                </NavLink>
              </li>
              <li>
                <ExternalLink href={LICENSE_URL} className={LINK}>
                  {u('footerLicense')}
                </ExternalLink>
              </li>
              <li>
                <NavLink href={ROUTES.privacy} prefetch={false} className={LINK}>
                  {u('footerPrivacy')}
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-t pt-6 text-caption text-ink-muted">
          <span className="font-mono">{u('footerVersion', { version: ENV.version })}</span>
          <span>{t('noTrackers')}</span>
          {IS_VERCEL ? null : (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-ink">{u('onchainBadge')}</span>
          )}
        </div>
      </div>
    </footer>
  );
}
