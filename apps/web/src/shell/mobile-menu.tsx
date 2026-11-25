'use client';

import { Menu } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { lazyChunk } from '@/lib/lazy-chunk';
import { messages as ui } from '@/messages/ui.messages';
import { useLazyOverlay } from '@/ui/lazy-overlay';
import { PlainIconButton } from '@/ui/plain-icon-button';

/** The sheet and its switches load when the page is idle, or on the first hover, focus or press (ruling R23). */
export const menuSheet = lazyChunk(() => import('./menu-sheet'));

/** Below 48rem the navigation and the settings live in one bottom sheet. */
export function MobileMenu() {
  const u = useT(ui);
  const { open, setOpen, id, anchor, trigger, content } = useLazyOverlay(menuSheet);
  return (
    <>
      <PlainIconButton {...trigger} icon={Menu} label={u('menu')} />
      {content ? <content.MenuSheet id={id} anchor={anchor} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
