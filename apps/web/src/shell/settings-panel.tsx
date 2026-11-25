'use client';

import type { RefObject } from 'react';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { AnchoredPopover } from '@/ui/popover';
import { HapticsSwitch } from './haptics-switch';
import { LangSwitch } from './lang-switch';
import { ThemeSwitch } from './theme-switch';

/** The content of SettingsMenu, in its own chunk. */
export function SettingsPanel(p: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const t = useT(shell);
  return (
    <AnchoredPopover {...p} label={t('settings')} className="flex w-72 flex-col gap-5 p-4">
      <LangSwitch />
      <ThemeSwitch />
      <HapticsSwitch />
    </AnchoredPopover>
  );
}
