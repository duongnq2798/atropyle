import { cn } from '@/lib/cn';

/**
 * TxCard's own boxes down to a hold up front (`holdPlacement="top"`), shared with the silhouette that stands in its
 * place while the plan is prepared (HoldCardShape): the card, its header and heading, the area under the heading, and
 * the area that centres the hold. Plain strings: the silhouette rides the first load of /vault/, TxCard does not.
 */
export const TX_CARD = 'flex flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6';
export const TX_HEADER = 'flex flex-col gap-1.5';
/** The card's heading; one step smaller under a heading of the page that already names its action (`nested`). */
export const txHeading = (nested: boolean) =>
  cn('flex items-center gap-2 font-display text-ink outline-none', nested ? 'text-lead' : 'text-title');
/** With the hold up front: what stands first under the heading (the hold, or its end and the Receipt). */
export const TX_ACTION_TOP = 'flex flex-col gap-3';
/** The area of the send control: a hold centred, a button at the end of the card. */
export const txSendArea = (hold: boolean) =>
  cn('flex flex-col gap-2', hold ? 'items-center' : 'items-stretch sm:items-end');
