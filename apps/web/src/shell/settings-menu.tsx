'use client';

import { Settings } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { lazyChunk } from '@/lib/lazy-chunk';
import { messages as shell } from '@/messages/shell.messages';
import { useLazyOverlay } from '@/ui/lazy-overlay';
import { PlainIconButton } from '@/ui/plain-icon-button';

/** The popover and its switches load when the page is idle, or on the first hover, focus or press (ruling R23). */
export const settingsPanel = lazyChunk(() => import('./settings-panel'));

export function SettingsMenu() {
  const t = useT(shell);
  const { open, setOpen, id, anchor, trigger, content } = useLazyOverlay(settingsPanel);
  return (
    <>
      <PlainIconButton {...trigger} icon={Settings} label={t('settings')} />
      {content ? <content.SettingsPanel id={id} anchor={anchor} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
