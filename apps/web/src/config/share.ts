/**
 * The share card of the site: what X, and any Open Graph reader, shows for a link to it. Plain values and no imports,
 * so scripts outside the Next app (scripts/test/tooling/daily-check.test.ts) can read it. Attribute text, so no `"`,
 * `&`, `<` or `>` (test/unit/share.test.ts).
 */
export const SHARE = {
  /** The production host, deployment.webUrl of X Layer (test/unit/share.test.ts keeps the two equal). */
  origin: 'https://atropyle.xyz/',
  siteName: 'Atropyle',
  title: 'Atropyle: inheritance and wallet recovery on X Layer',
  description:
    'A vault for crypto inheritance and wallet recovery on X Layer. A circuit decides every lifecycle transition of a vault, and so every release of its assets. Anyone can prove it.',
  image: {
    /**
     * At the root of the site, from share/ under the same name (npm run og:image); only a build that knows its origin
     * carries it. A new image gets a new name: X and other readers keep a card, image included, by its URL. v1 was
     * og.png and v2 the night card of PR #24; v3 is the card on vellum.
     */
    path: 'og-v3.png',
    type: 'image/png',
    width: 1200,
    height: 630,
    alt: 'Atropyle. A circuit decides, not an admin. Inheritance and wallet recovery on X Layer: check in now and then; if you stop, your heirs can claim. On a light card, a gold thread is woven under the title and runs through the real policy circuit, above the line Run the proof in your browser, at atropyle.xyz/#/proof.',
  },
} as const;

/** The absolute URL of the share image on the production host. */
export const SHARE_IMAGE_URL = `${SHARE.origin}${SHARE.image.path}`;
