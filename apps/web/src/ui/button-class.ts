import { cn } from '@/lib/cn';

/**
 * The button look, outside the 'use client' module of Button (button.tsx re-exports it): a server component cannot call
 * a function a client module exports, and the home page's bands (src/home/bands.tsx) are server components.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The shared look: position, flex centring, the pill, the press and the disabled state, as one class that globals.css
 * builds from the same utilities (`.btn`, components layer). Written out, its 17 utilities were about 330 bytes of
 * HTML per button, twice in a server component's (7C-F1).
 */
const BASE = 'btn';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-thread text-on-thread shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:bg-thread/90',
  secondary: 'border border-line-strong bg-surface-2 text-ink hover:border-thread hover:bg-surface-3',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-on-danger hover:bg-danger/90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-small',
  lg: 'h-12 px-6 text-body',
};

/** The button look, for links that act as buttons (`<Link className={buttonClass(...)}>`). */
export function buttonClass(o: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANT[o.variant ?? 'secondary'], SIZE[o.size ?? 'md'], o.className);
}
