// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buttonClass } from '../../src/ui/button-class';

const GLOBALS = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

/** The shared look every button and button-like link had as 17 utilities on the element. */
const BASE = [
  'relative',
  'inline-flex',
  'select-none',
  'items-center',
  'justify-center',
  'gap-2',
  'whitespace-nowrap',
  'rounded-full',
  'font-medium',
  'transition-[background-color,border-color,color,translate,scale]',
  'duration-150',
  'ease-out-expo',
  'motion-safe:active:scale-[0.98]',
  'disabled:pointer-events-none',
  'disabled:opacity-50',
  'aria-disabled:pointer-events-none',
  'aria-disabled:opacity-50',
];

describe('buttonClass (7C-F1)', () => {
  it('names the shared look with one class, so each button prints 9 bytes of it instead of 330', () => {
    expect(buttonClass()).toBe(
      'btn border border-line-strong bg-surface-2 text-ink hover:border-thread hover:bg-surface-3 h-10 px-4 text-small',
    );
    expect(buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })).toBe(
      'btn bg-thread text-on-thread shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:bg-thread/90 h-12 px-6 text-body w-full',
    );
    for (const u of BASE) expect(buttonClass().split(' ')).not.toContain(u);
  });

  it('globals.css applies the same utilities to .btn, in the components layer, under any utility a caller adds', () => {
    const layer = GLOBALS.slice(GLOBALS.indexOf('@layer components'));
    const rule = /\.btn\s*\{\s*@apply\s+([^;]+);\s*\}/.exec(layer);
    expect(rule?.[1].trim().split(/\s+/)).toEqual(BASE);
  });
});
