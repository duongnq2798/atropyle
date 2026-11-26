import type { Metadata } from 'next';
import type { Target } from './env';
import { SHARE, SHARE_IMAGE_URL } from './share';

export type ShareMetadata = Pick<Metadata, 'openGraph' | 'twitter'>;

/**
 * The Open Graph and X card tags of a page. Only the vercel build knows its origin, so only it carries the image and
 * absolute URLs (scripts/lib/share-image.ts copies the image into its out/). The deweb build keeps the text alone: it
 * links nothing off-chain, and a card image would be bytes on chain that the page itself never shows.
 *
 * `path` is the route of the page ('/' for home) and sets og:url. Without it there is no og:url, so the root layout's
 * defaults never claim the home URL for another page. Next replaces, not merges, openGraph and twitter per page.
 */
export function shareMetadata(target: Target, path?: string): ShareMetadata {
  const text = { title: SHARE.title, description: SHARE.description };
  if (target !== 'vercel') {
    return {
      openGraph: { type: 'website', siteName: SHARE.siteName, ...text },
      twitter: { card: 'summary', ...text },
    };
  }
  const { type, width, height, alt } = SHARE.image;
  return {
    openGraph: {
      type: 'website',
      siteName: SHARE.siteName,
      ...text,
      ...(path === undefined ? {} : { url: new URL(path.replace(/^\/+/, ''), SHARE.origin).href }),
      images: [{ url: SHARE_IMAGE_URL, type, width, height, alt }],
    },
    twitter: { card: 'summary_large_image', ...text, images: [{ url: SHARE_IMAGE_URL, alt }] },
  };
}
