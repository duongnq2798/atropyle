'use client';

import { BOOT_SCRIPT } from './boot';

/**
 * In <head>: redirects legacy links and applies the stored theme before anything paints. A client component, so that
 * Next's payload names it instead of carrying its text a second time: on a long page past gzip's window from the first,
 * 0.6 kB gzip on the home page (7C-F1, test/build/shell.test.ts). The prerender writes the script. In the browser, where
 * the bundler compiles `typeof window` to "object" and the text drops out of the chunk, the constant empty string lets
 * React keep the prerendered script through hydration, as the home stage's island does (src/home/stage-island.tsx).
 */
export function BootScript() {
  return (
    <script
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built from two functions of this file's sibling, or the constant empty string; no input reaches it.
      dangerouslySetInnerHTML={{ __html: typeof window === 'undefined' ? BOOT_SCRIPT : '' }}
    />
  );
}
