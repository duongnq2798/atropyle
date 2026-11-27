import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outOf } from './paths';

/**
 * Code that must reach a page only through a dynamic import, each known by string literals that only it carries.
 * Checked against motion 14.14.0 and uqr 0.1.3 in node_modules: the minifier keeps string literals, and these appear in
 * no other module of the site.
 * - The features of the m.* components (motion's domMax): `"projectionUpdate"` is the event of the projection node of
 *   the layout feature (motion-dom, projection/node/create-projection-node.mjs), `":focus-visible"` the selector of
 *   the focus gesture of domAnimation (framer-motion, gestures/focus.mjs). MotionProvider loads them with import().
 * - The QR encoder: uqr's alphanumeric charset (uqr, dist/index.mjs). The wallet sheet loads it only for the
 *   no-wallet help.
 * - The Radix overlays (dialog, popover, tooltip), checked against @radix-ui/react-popper 1.4.0, react-focus-scope
 *   1.3.1 and react-dismissable-layer 1.2.1: the popper's wrapper attribute, the focus scope's mount event and the
 *   layer's outside-press event. The wallet sheet, the wallet menu, the settings popover and the menu sheet load on
 *   their first open, and a page with a tooltip carries it itself (ruling R23).
 * - viem, checked against viem 2.58.0: its version tag `viem@${version}` (viem, _esm/errors/base.js), which every viem
 *   error carries.
 * - The SDK: the CLI hint of its UNKNOWN code in ERROR_INFO (packages/sdk/src/errors.ts), which every AtropyleError
 *   reads. No file of src/ carries it: this site words that hint itself (src/tx/impl/errors-view.ts).
 * - The time machine's view (src/flows/time-machine/time-machine.tsx): the template of its moment test ids,
 *   `${testId}-moment-${i}`. Its shell, in the first load of the page that shows it, has no such template. Every
 *   page loads the view through timeMachineViewChunk (lazy.tsx).
 * - The owner tab (src/app/vault/owner-tab.tsx, through ownerTabChunk in lazy-panels.tsx): the ritual's test id
 *   "owner-ritual", in ritual.tsx. Its editor (edit-config.tsx, through editConfigChunk) loads apart from it, on the
 *   first part the owner picks: its test id "owner-edit-fields" is in that file only.
 * The motion features stay out of every page. The QR encoder, the overlays, viem and the SDK stay out of the pages that
 * are only the shell (`/` and the 404 pages; Decision 13 for viem and the SDK): a route of Plan 7B may show a QR code
 * or a tooltip, or read the chain, from its first paint, inside its 240 kB.
 */
const SHELL_PAGES = new Set(['index.html', '404.html', '404/index.html', '_not-found/index.html']);
const LAZY: Record<string, { markers: readonly RegExp[]; pages: 'all' | 'shell' }> = {
  'the motion features': { markers: [/["'`]projectionUpdate["'`]/, /["'`]:focus-visible["'`]/], pages: 'all' },
  'the QR encoder': { markers: [/["'`]0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ \$%\*\+-\.\/:["'`]/], pages: 'shell' },
  'the Radix overlays': {
    markers: [
      /["'`]data-radix-popper-content-wrapper["'`]/,
      /["'`]focusScope\.autoFocusOnMount["'`]/,
      /["'`]dismissableLayer\.pointerDownOutside["'`]/,
    ],
    pages: 'shell',
  },
  viem: { markers: [/["'`]viem@/], pages: 'shell' },
  'the SDK': { markers: [/["'`]Run again with --verbose and report the output\.["'`]/], pages: 'shell' },
  'the time machine': { markers: [/\}-moment-\$\{/], pages: 'all' },
  'the owner tab': { markers: [/["'`]owner-ritual["'`]/], pages: 'all' },
  'the owner editor': { markers: [/["'`]owner-edit-fields["'`]/], pages: 'all' },
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** The scripts a page loads before it is interactive, as .size-limit.mjs counts them: every src but the nomodule one. */
function firstLoad(out: string, page: string): string[] {
  const files: string[] = [];
  for (const [tag] of readFileSync(page, 'utf8').matchAll(/<script\b[^>]*>/gi)) {
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
    if (!src || /\snomodule\b/i.test(tag)) continue;
    const path = join(out, ...decodeURIComponent(src.split('?')[0]).split('/'));
    if (!existsSync(path)) throw new Error(`${relative(out, page)} loads ${src}, which is not in out/`);
    files.push(path);
  }
  return files;
}

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} build`, () => {
    const out = outOf(target);
    const pages = walk(out).filter((f) => f.endsWith('.html'));
    const scripts = walk(join(out, '_next', 'static')).filter((f) => f.endsWith('.js'));
    const name = (file: string) => relative(out, file).split(sep).join('/');

    for (const [what, { markers, pages: scope }] of Object.entries(LAZY)) {
      const which = scope === 'all' ? 'any page' : 'the shell pages';
      it(`loads ${what} only through a dynamic import, in no first-load script of ${which}`, () => {
        expect(pages.map(name)).toContain('index.html');
        for (const page of SHELL_PAGES) expect(pages.map(name)).toContain(page);
        // The markers are real: the build carries each of them, in a chunk that no page loads first.
        for (const marker of markers) {
          expect(
            scripts.some((f) => marker.test(readFileSync(f, 'utf8'))),
            `${marker} in out/_next/static`,
          ).toBe(true);
        }
        for (const page of pages.filter((p) => scope === 'all' || SHELL_PAGES.has(name(p)))) {
          for (const file of firstLoad(out, page)) {
            const code = readFileSync(file, 'utf8');
            for (const marker of markers)
              expect(marker.test(code), `${name(page)} loads ${name(file)}: ${marker}`).toBe(false);
          }
        }
      });
    }
  });
}
