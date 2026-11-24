import { type RefObject, useId, useRef, useState } from 'react';
import { type LazyChunk, useChunk } from '@/lib/lazy-chunk';

/** What the trigger button of a lazy overlay spreads on itself. */
export interface OverlayTrigger {
  ref: RefObject<HTMLButtonElement | null>;
  'aria-haspopup': 'dialog';
  'aria-expanded': boolean;
  /** The content's id while it is open, as a Radix trigger has it. */
  'aria-controls': string | undefined;
  onClick(): void;
  onPointerEnter(): void;
  onFocus(): void;
}

/**
 * An overlay whose button is part of the first paint and whose content is not (ruling R23). The button is a plain
 * button with the attributes a Radix trigger gives its own; the content's chunk loads on pointerenter or focus of
 * the button, so it opens at once, or on the press when neither came first. The content takes `id`, positions on
 * `anchor` and gives focus back to it (AnchoredPopover, or a Dialog with onCloseAutoFocus).
 */
export function useLazyOverlay<T>(chunk: LazyChunk<T>): {
  open: boolean;
  setOpen(open: boolean): void;
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  trigger: OverlayTrigger;
  /** The loaded chunk; null until the first open has loaded it. */
  content: T | null;
} {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const content = useChunk(chunk, open, () => setOpen(false));
  const expanded = open && content !== null;
  return {
    open,
    setOpen,
    id,
    anchor,
    content,
    trigger: {
      ref: anchor,
      'aria-haspopup': 'dialog',
      'aria-expanded': expanded,
      'aria-controls': expanded ? id : undefined,
      onClick: () => setOpen(!open),
      onPointerEnter: chunk.preload,
      onFocus: chunk.preload,
    },
  };
}
