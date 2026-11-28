// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SHARE, SHARE_IMAGE_URL } from '@/config/share';
import { shareMetadata } from '@/config/share-metadata';
import { addShareImage, SHARE_IMAGE_FILE } from '../../scripts/lib/share-image';

const DEPLOYMENT = fileURLToPath(new URL('../../../../deployments/xlayer.json', import.meta.url));
const deployment = JSON.parse(readFileSync(DEPLOYMENT, 'utf8')) as { webUrl: string };

/** Width, height and colour type from the IHDR chunk, after checking the PNG signature. */
function pngHeader(bytes: Uint8Array): { width: number; height: number; colorType: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.subarray(0, 8)]).toEqual(signature);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe('IHDR');
  return { width: view.getUint32(16), height: view.getUint32(20), colorType: bytes[25] };
}

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

describe('the share card', () => {
  it('lives on the production host, the webUrl of the X Layer deployment, under a versioned name', () => {
    expect(SHARE.origin).toBe(deployment.webUrl);
    expect(SHARE_IMAGE_URL).toBe(`https://atropyle.xyz/${SHARE.image.path}`);
    // X keeps a card by its image URL: a changed image needs the next name (og-v3 is the vellum card).
    expect(SHARE.image.path).toMatch(/^og-v\d+\.png$/);
  });

  it('holds attribute-safe text, and an alt that fits the X limit of 420 characters', () => {
    for (const text of [SHARE.siteName, SHARE.title, SHARE.description, SHARE.image.alt]) {
      expect(text).toMatch(/^[^"&<>]+$/);
    }
    expect(SHARE.image.alt.length).toBeLessThanOrEqual(420);
  });

  it('is a committed, opaque 1200x630 PNG, well under the 5 MB X allows', () => {
    const bytes = new Uint8Array(readFileSync(SHARE_IMAGE_FILE));
    const { width, height, colorType } = pngHeader(bytes);
    expect({ width, height }).toEqual({ width: SHARE.image.width, height: SHARE.image.height });
    expect({ width: SHARE.image.width, height: SHARE.image.height }).toEqual({ width: 1200, height: 630 });
    // 2 is truecolour without alpha: a card with see-through pixels shows the reader's own background.
    expect(colorType).toBe(2);
    expect(bytes.byteLength).toBeLessThan(400_000);
  });

  it('is the only image under share/: an old card left behind would ship with nothing linking it', () => {
    expect(readdirSync(dirname(SHARE_IMAGE_FILE))).toEqual([SHARE.image.path]);
  });

  it('says what the vellum card shows, with the browser proof and no npx', () => {
    const text = [SHARE.title, SHARE.description, SHARE.image.alt].join(' ');
    expect(text).not.toMatch(/npx|dark card|every step/i);
    expect(SHARE.image.alt).toContain('light card');
    expect(SHARE.image.alt).toContain('Run the proof in your browser');
    expect(SHARE.image.alt).toContain('atropyle.xyz/#/proof');
    const script = readFileSync(fileURLToPath(new URL('../../scripts/og-image.ts', import.meta.url)), 'utf8');
    expect(script).not.toMatch(/npx|every step/);
    // The arrow is a lucide icon drawn as SVG: U+2192 is in none of the self-hosted subsets (test/unit/glyphs.test.ts).
    expect(script).not.toMatch(/&rarr;|\u2192|→/);
    expect(script).toContain('Run the proof in your browser');
  });
});

describe('shareMetadata', () => {
  it('gives vercel the large card with absolute https URLs, and og:url only for a page that names its route', () => {
    const home = shareMetadata('vercel', '/');
    expect(home.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Atropyle',
      title: SHARE.title,
      description: SHARE.description,
      url: 'https://atropyle.xyz/',
      images: [{ url: SHARE_IMAGE_URL, type: 'image/png', width: 1200, height: 630, alt: SHARE.image.alt }],
    });
    expect(home.twitter).toEqual({
      card: 'summary_large_image',
      title: SHARE.title,
      description: SHARE.description,
      images: [{ url: SHARE_IMAGE_URL, alt: SHARE.image.alt }],
    });
    expect(shareMetadata('vercel', '/proof/').openGraph).toMatchObject({ url: 'https://atropyle.xyz/proof/' });
    expect(shareMetadata('vercel').openGraph).not.toHaveProperty('url');
  });

  it('gives deweb the text alone: no URL, no image, the small card', () => {
    const card = shareMetadata('deweb', '/');
    expect(JSON.stringify(card)).not.toContain('://');
    expect(card.openGraph).toEqual({
      type: 'website',
      siteName: 'Atropyle',
      title: SHARE.title,
      description: SHARE.description,
    });
    expect(card.twitter).toEqual({ card: 'summary', title: SHARE.title, description: SHARE.description });
  });
});

describe('addShareImage', () => {
  it('copies the card to the root of out/ for vercel only', () => {
    const vercel = mkdtempSync(join(tmpdir(), 'atropyle-share-'));
    const deweb = mkdtempSync(join(tmpdir(), 'atropyle-share-'));
    temps.push(vercel, deweb);
    expect(addShareImage(vercel, 'vercel')).toBe(true);
    expect(readFileSync(join(vercel, SHARE.image.path)).equals(readFileSync(SHARE_IMAGE_FILE))).toBe(true);
    expect(addShareImage(deweb, 'deweb')).toBe(false);
    expect(addShareImage(deweb, undefined)).toBe(false);
    expect(readdirSync(deweb)).toEqual([]);
  });
});
