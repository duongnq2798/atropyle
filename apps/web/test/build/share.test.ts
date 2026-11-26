import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARE_IMAGE_FILE } from '../../scripts/lib/share-image';
import { SHARE, SHARE_IMAGE_URL } from '../../src/config/share';
import { outOf } from './paths';

/** The Open Graph (`property`) and X (`name`) tags of a page, by key. */
function cardOf(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const key = attrs.property ?? attrs.name;
    if (key && /^(og|twitter):/.test(key) && attrs.content !== undefined) tags.set(key, attrs.content);
  }
  return tags;
}
const read = (target: 'vercel' | 'deweb', file: string) => readFileSync(join(outOf(target), file), 'utf8');

describe('vercel share card', () => {
  it('home carries the large X card, with og:url and the image as absolute https URLs', () => {
    expect(Object.fromEntries(cardOf(read('vercel', 'index.html')))).toEqual({
      'og:type': 'website',
      'og:site_name': 'Atropyle',
      'og:title': SHARE.title,
      'og:description': SHARE.description,
      'og:url': 'https://atropyle.xyz/',
      'og:image': SHARE_IMAGE_URL,
      'og:image:type': 'image/png',
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:alt': SHARE.image.alt,
      'twitter:card': 'summary_large_image',
      'twitter:title': SHARE.title,
      'twitter:description': SHARE.description,
      'twitter:image': SHARE_IMAGE_URL,
      'twitter:image:alt': SHARE.image.alt,
    });
  });

  it('another page keeps the card but claims no og:url of its own', () => {
    const card = cardOf(read('vercel', '404.html'));
    expect(card.get('twitter:card')).toBe('summary_large_image');
    expect(card.get('og:image')).toBe(SHARE_IMAGE_URL);
    expect(card.has('og:url')).toBe(false);
  });

  it('serves the image it links, at the root of the site', () => {
    expect(readFileSync(join(outOf('vercel'), SHARE.image.path)).equals(readFileSync(SHARE_IMAGE_FILE))).toBe(true);
  });
});

describe('deweb share card', () => {
  it('carries the text alone: the small card, no URL and no image', () => {
    for (const file of ['index.html', '404.html']) {
      const card = cardOf(read('deweb', file));
      expect(card.get('og:title'), file).toBe(SHARE.title);
      expect(card.get('twitter:card'), file).toBe('summary');
      expect(
        [...card.values()].filter((v) => v.includes('://')),
        file,
      ).toEqual([]);
    }
    expect(readdirSync(outOf('deweb')).filter((f) => /^og.*\.png$/.test(f))).toEqual([]);
  });
});
