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
 * - The calls of "Ask X Layer": the selector of step(uint256,bytes,bytes), with which every calldata of
 *   src/home/impl/ask-calls.ts starts. Only that generated module carries it: viem computes selectors at run time.
 *   It loads on intent (R18.18, R18.19).
 * - The circuits: the error of buildAll's resolver for a processor it does not know, `unknown cpu ${cpu}`
 *   (circuits/src/policy.ts), a template literal the minifier keeps. The home stage loads them on intent (7C T6).
 * - The time machine (7B T5): NEW_WALLET of its scenario logic, `0x${'7e'.repeat(20)}` (src/flows/impl/time-machine.ts),
 *   in either form a minifier leaves, and Radix Slider's `"SliderThumb"` (@radix-ui/react-slider), which only the
 *   Scrubber carries. The home stage loads both on intent (R18.18), the vault page and the wizard when they show it.
 * The motion features stay out of every page. The QR encoder, the overlays, viem and the SDK stay out of the pages that
 * are only the shell (`/` and the 404 pages; Decision 13 for viem and the SDK): a route of Plan 7B may show a QR code
 * or a tooltip, or read the chain, from its first paint, inside its 240 kB. /proof/ is held to the same, ruling R17 of
 * 7C T3.
 */
const SHELL_PAGES = new Set(['index.html', '404.html', '404/index.html', '_not-found/index.html']);
/** `/proof/` too: its proof code, the SDK and viem load when the reader presses Run (or points at it), never first. */
const LEAN_PAGES = new Set([...SHELL_PAGES, 'proof/index.html']);
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
  'the circuits': { markers: [/unknown cpu \$\{/], pages: 'shell' },
  'the time machine': {
    markers: [/["'`]7e["'`]\.repeat\(20\)|0x(?:7e){20}/i, /["'`]SliderThumb["'`]/],
    pages: 'shell',
  },
  'the Ask X Layer calls': { markers: [/["'`]0xe8281a1a/], pages: 'shell' },
};

/**
 * Code a page must load once (7C T6, ruling R33): the Thread, known by its `thread-tremble` animation class, which
 * only thread.tsx writes. The 404 boundary's chunk, which every page loads, and the home stage's both use it, and
 * Turbopack copies a module of the not-found boundary into a page's own chunk unless the shell imports it too.
 */
const ONCE: Record<string, RegExp> = { 'the Thread': /thread-tremble/ };

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
      const which = scope === 'all' ? 'any page' : 'the shell pages and /proof/';
      it(`loads ${what} only through a dynamic import, in no first-load script of ${which}`, () => {
        expect(pages.map(name)).toContain('index.html');
        for (const page of LEAN_PAGES) expect(pages.map(name)).toContain(page);
        // The markers are real: the build carries each of them, in a chunk that no page loads first.
        for (const marker of markers) {
          expect(
            scripts.some((f) => marker.test(readFileSync(f, 'utf8'))),
            `${marker} in out/_next/static`,
          ).toBe(true);
        }
        for (const page of pages.filter((p) => scope === 'all' || LEAN_PAGES.has(name(p)))) {
          for (const file of firstLoad(out, page)) {
            const code = readFileSync(file, 'utf8');
            for (const marker of markers)
              expect(marker.test(code), `${name(page)} loads ${name(file)}: ${marker}`).toBe(false);
          }
        }
      });
    }

    for (const [what, marker] of Object.entries(ONCE)) {
      it(`loads ${what} once on each page of the shell and on /proof/`, () => {
        for (const page of LEAN_PAGES) {
          const holders = firstLoad(out, join(out, page)).filter((f) => marker.test(readFileSync(f, 'utf8')));
          expect(holders.map(name), page).toHaveLength(1);
        }
      });
    }

    // 7C T8. TanStack's query observer, known by its method getOptimisticResult (@tanstack/query-core, queryObserver),
    // a property name the minifier keeps. A page that calls useQuery through a module the shell loads (chain/hooks.ts)
    // brings it into the first load of every page (7B T4), so each hook a page calls has a module of its own
    // (use-sdk.ts, use-my-vaults.ts). /sign/ and /proof/ load it first, so the marker is real.
    it('loads the query observer in no first-load script of the shell pages', () => {
      const marker = /\bgetOptimisticResult\b/;
      expect(
        scripts.some((f) => marker.test(readFileSync(f, 'utf8'))),
        `${marker} in out/_next/static`,
      ).toBe(true);
      for (const page of SHELL_PAGES) {
        for (const file of firstLoad(out, join(out, page))) {
          expect(marker.test(readFileSync(file, 'utf8')), `${page} loads ${name(file)}: ${marker}`).toBe(false);
        }
      }
    });

    // 7C T8: /me/ reads the chain after its first paint (Decision 13): its first load is the shell and the page.
    it('loads viem and the SDK in no first-load script of /me/', () => {
      expect(pages.map(name)).toContain('me/index.html');
      const markers = [...LAZY.viem.markers, ...LAZY['the SDK'].markers];
      for (const file of firstLoad(out, join(out, 'me', 'index.html'))) {
        const code = readFileSync(file, 'utf8');
        for (const marker of markers) {
          expect(marker.test(code), `me/index.html loads ${name(file)}: ${marker}`).toBe(false);
        }
      }
    });

    // 7C T9: /join/ checks the link's checksum through the SDK's toAddress, after its first paint; the email pages
    // never read the chain. None of the three loads viem or the SDK first.
    it('loads viem and the SDK in no first-load script of /join/ and the email pages', () => {
      const markers = [...LAZY.viem.markers, ...LAZY['the SDK'].markers];
      for (const page of ['join/index.html', 'alerts/confirm/index.html', 'alerts/unsubscribe/index.html']) {
        expect(pages.map(name)).toContain(page);
        for (const file of firstLoad(out, join(out, ...page.split('/')))) {
          const code = readFileSync(file, 'utf8');
          for (const marker of markers) expect(marker.test(code), `${page} loads ${name(file)}: ${marker}`).toBe(false);
        }
      }
    });
  });
}
