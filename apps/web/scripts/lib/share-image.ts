import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARE } from '../../src/config/share';

/** The committed share card, rendered by scripts/og-image.ts (`npm run og:image -w apps/web`). */
export const SHARE_IMAGE_FILE = fileURLToPath(new URL('../../share/og.png', import.meta.url));

/**
 * Copies the share card to the root of out/ for the vercel build, the only one whose pages link it
 * (src/config/share-metadata.ts). The deweb build never gets it: nothing there links it, and on chain it would only
 * cost bytes. Returns whether it copied.
 */
export function addShareImage(outDir: string, target: string | undefined): boolean {
  if (target !== 'vercel') return false;
  copyFileSync(SHARE_IMAGE_FILE, join(outDir, SHARE.image.path));
  return true;
}
