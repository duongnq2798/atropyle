'use client';

import { Settings } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { IconButton } from '@/ui/icon-button';
import { Popover } from '@/ui/popover';
import { HapticsSwitch } from './haptics-switch';
import { LangSwitch } from './lang-switch';
import { ThemeSwitch } from './theme-switch';

export function SettingsMenu() {
  const t = useT(shell);
  return (
    <Popover
      label={t('settings')}
      trigger={<IconButton icon={Settings} label={t('settings')} tooltip={false} />}
      className="flex w-72 flex-col gap-5 p-4"
    >
      <LangSwitch />
      <ThemeSwitch />
      <HapticsSwitch />
    </Popover>
  );
}
