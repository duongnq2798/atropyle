'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { Dialog } from '@/ui/dialog';
import { IconButton } from '@/ui/icon-button';
import { HapticsSwitch } from './haptics-switch';
import { LangSwitch } from './lang-switch';
import { NavList } from './nav-list';
import { ThemeSwitch } from './theme-switch';

/** Below 48rem the navigation and the settings live in one bottom sheet. */
export function MobileMenu() {
  const t = useT(shell);
  const u = useT(ui);
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={u('menu')}
      trigger={<IconButton icon={Menu} label={u('menu')} tooltip={false} />}
    >
      <nav aria-label={t('navLabel')}>
        <NavList layout="sheet" onNavigate={() => setOpen(false)} />
      </nav>
      <div className="flex flex-col gap-5 border-line border-t pt-5">
        <LangSwitch />
        <ThemeSwitch />
        <HapticsSwitch />
      </div>
    </Dialog>
  );
}
