import type { ReactNode } from 'react';

/**
 * Which first paint a reader without JavaScript gets: the empty state (/vault/: it reads on its own), or the frame of
 * what loads (/verify/ and /sign/: their frame says what the page needs, or holds the command that does the same).
 */
type NoScript = 'empty' | 'wait';

/**
 * Written out in full so that Tailwind finds every class. `display: contents` keeps each wrapper out of the layout:
 * the page column lays out its children as if the wrapper were not there.
 */
const CLASSES = {
  address: {
    empty: {
      empty: 'contents [:root[data-hash=address]_&]:hidden',
      wait: 'hidden [:root[data-hash=address]_&]:contents',
    },
    wait: {
      empty: 'contents [:root[data-hash=address]_&]:hidden [@media(scripting:none)]:hidden',
      wait: 'hidden [:root[data-hash=address]_&]:contents [@media(scripting:none)]:contents',
    },
  },
  request: {
    empty: {
      empty: 'contents [:root[data-hash=request]_&]:hidden',
      wait: 'hidden [:root[data-hash=request]_&]:contents',
    },
    wait: {
      empty: 'contents [:root[data-hash=request]_&]:hidden [@media(scripting:none)]:hidden',
      wait: 'hidden [:root[data-hash=request]_&]:contents [@media(scripting:none)]:contents',
    },
  },
} as const;

export interface FirstPaintProps {
  /** useMounted(): false in the static HTML and while hydrating. */
  mounted: boolean;
  /** What the boot script marks on <html data-hash> when the fragment holds this page's subject (hash-mark.ts). */
  mark: 'address' | 'request';
  noScript: NoScript;
  /** The empty state, or null once mounted when the fragment holds a subject. */
  empty: ReactNode | null;
  /** Before mount: the frame of what loads. Once mounted: what the fragment opened, or null. */
  wait: ReactNode | null;
}

/**
 * A page that reads its fragment after mount renders both first paints into its static HTML, and CSS shows the one
 * the boot script's mark fits, so the first paint is the final layout (spec §18.2 rule 6) and nothing below it moves
 * when the page mounts (7B-P1: CLS 0 on /vault/, /sign/ and /verify/). Once mounted, the empty state keeps its wrapper
 * and its place in the tree, so React keeps its DOM (and what was typed into it).
 */
export function FirstPaint({ mounted, mark, noScript, empty, wait }: FirstPaintProps) {
  const c = CLASSES[mark][noScript];
  return (
    <>
      {empty === null ? null : (
        <div data-first-paint="empty" className={mounted ? 'contents' : c.empty}>
          {empty}
        </div>
      )}
      {wait === null ? null : mounted ? (
        wait
      ) : (
        <div data-first-paint="wait" className={c.wait}>
          {wait}
        </div>
      )}
    </>
  );
}
