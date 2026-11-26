'use client';

import type { RefObject } from 'react';
import type { Address as Addr } from 'viem';
import type { WizardStep } from '@/flows/impl/wizard';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/create.messages';
import { Dialog } from '@/ui/dialog';
import { PreviewBody, type PreviewModel } from './preview';

/**
 * The strip's sheet, in its own chunk (Ruling 19): the Radix dialog stays out of /create/'s first load (R23). Like a
 * Radix trigger, the strip gets focus back on close.
 */
export function PreviewSheet(p: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
  model: PreviewModel;
  step: WizardStep;
  vault: Addr | null;
}) {
  const t = useT(messages);
  return (
    <Dialog
      id={p.id}
      open={p.open}
      onOpenChange={p.onOpenChange}
      title={t('previewTitle')}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        p.anchor.current?.focus();
      }}
    >
      <div data-testid="create-preview-sheet">
        <PreviewBody model={p.model} step={p.step} vault={p.vault} testId="create-sheet" />
      </div>
    </Dialog>
  );
}
