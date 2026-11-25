'use client';

import type { RefObject } from 'react';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { Dialog } from '@/ui/dialog';
import { HapticsSwitch } from './haptics-switch';
import { LangSwitch } from './lang-switch';
import { NavList } from './nav-list';
import { ThemeSwitch } from './theme-switch';

/** The content of MobileMenu, in its own chunk. Like a Radix trigger, the Menu button gets focus back on close. */
export function MenuSheet({
  id,
  anchor,
  open,
  onOpenChange,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const t = useT(shell);
  const u = useT(ui);
  return (
    <Dialog
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      title={u('menu')}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        anchor.current?.focus();
      }}
    >
      <nav aria-label={t('navLabel')}>
        <NavList layout="sheet" onNavigate={() => onOpenChange(false)} />
      </nav>
      <div className="flex flex-col gap-5 border-line border-t pt-5">
        <LangSwitch />
        <ThemeSwitch />
        <HapticsSwitch />
      </div>
    </Dialog>
  );
}
