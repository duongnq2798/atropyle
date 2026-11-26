import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HtmlTagDescriptor, Plugin } from 'vite';
// One copy and one image for both web apps, so the v2 cutover changes no card. Plain values, no Next import.
import { SHARE, SHARE_IMAGE_URL } from '../../web/src/config/share.ts';

/** The image web v2 ships too, rendered by apps/web/scripts/og-image.ts. */
export const SHARE_IMAGE_FILE = fileURLToPath(new URL(`../../web/share/${SHARE.image.path}`, import.meta.url));

/**
 * The origin a site build is served from, when the build knows it. Only the production host does (VITE_TARGET is
 * the raw site target: targetOf in csp.ts folds vercel into pages). DeWEB is served by any gateway and must link
 * nothing off-chain; the Pages mirror has no origin of its own in this repository.
 */
export function shareOrigin(rawTarget: string | undefined): string | null {
  return rawTarget === 'vercel' ? SHARE.origin : null;
}

const meta = (key: 'property' | 'name', id: string, content: string | number): HtmlTagDescriptor => ({
  tag: 'meta',
  attrs: { [key]: id, content: String(content) },
  injectTo: 'head',
});

/**
 * Open Graph and X card tags. With an origin: the page URL and the large image, absolute as the readers need them.
 * Without: the text alone, with no URL in it (DeWEB's 100% on-chain rule) and the small card.
 * The legacy app is one page with hash routes, so og:url is the root of the site.
 */
export function shareTags(origin: string | null): HtmlTagDescriptor[] {
  const text = [
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SHARE.siteName),
    meta('property', 'og:title', SHARE.title),
    meta('property', 'og:description', SHARE.description),
    meta('name', 'twitter:title', SHARE.title),
    meta('name', 'twitter:description', SHARE.description),
  ];
  if (origin === null) return [...text, meta('name', 'twitter:card', 'summary')];
  const { type, width, height, alt } = SHARE.image;
  return [
    ...text,
    meta('property', 'og:url', origin),
    meta('property', 'og:image', SHARE_IMAGE_URL),
    meta('property', 'og:image:type', type),
    meta('property', 'og:image:width', width),
    meta('property', 'og:image:height', height),
    meta('property', 'og:image:alt', alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:image', SHARE_IMAGE_URL),
    meta('name', 'twitter:image:alt', alt),
  ];
}

/** Adds the share tags to index.html, and the image to the root of the build when the tags link it. */
export function sharePlugin(rawTarget: string | undefined): Plugin {
  const origin = shareOrigin(rawTarget);
  return {
    name: 'atropyle-share',
    apply: 'build',
    transformIndexHtml: () => shareTags(origin),
    generateBundle() {
      if (origin === null) return;
      this.emitFile({ type: 'asset', fileName: SHARE.image.path, source: readFileSync(SHARE_IMAGE_FILE) });
    },
  };
}
