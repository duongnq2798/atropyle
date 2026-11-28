// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHARE } from '@/config/share';
import { APP_ICONS } from '../../scripts/lib/app-icons';
import { themeTokens } from '../../scripts/lib/tokens';

const at = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}
const manifest = JSON.parse(readFileSync(at('public/manifest.webmanifest'), 'utf8')) as Manifest;

/** Width, height and colour type (6: with alpha; 2: without) from the IHDR chunk of a committed PNG. */
function png(rel: string): { width: number; height: number; colorType: number } {
  const bytes = readFileSync(at(rel));
  expect(bytes.subarray(1, 4).toString('latin1'), rel).toBe('PNG');
  expect(bytes.subarray(12, 16).toString('latin1'), rel).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

describe('the vellum tokens', () => {
  it('are the brand palette of 26 Nov 2026, which the share card and the manifest paint with', () => {
    expect(themeTokens('light')).toMatchObject({
      bg: '#f6f1e7',
      'surface-1': '#fffdf8',
      ink: '#16130f',
      'ink-muted': '#5e574c',
      line: '#ddd3c2',
      'line-strong': '#80766a',
      thread: '#86590e',
      'on-thread': '#fffdf8',
      alive: '#106f5a',
      grace: '#945100',
      danger: '#b42318',
    });
  });
});

describe('manifest.webmanifest', () => {
  it('names the site, opens at its root, and paints the vellum background', () => {
    expect(manifest).toMatchObject({
      id: '/',
      name: SHARE.siteName,
      short_name: SHARE.siteName,
      start_url: '/',
      scope: '/',
      display: 'minimal-ui',
    });
    expect(manifest.background_color).toBe(themeTokens('light').bg);
    expect(manifest.theme_color).toBe(themeTokens('light').bg);
    // Served by deweb too, so it names only paths on the site.
    expect(JSON.stringify(manifest)).not.toContain('://');
  });

  it('lists the public icons at the size each file has, with the see-through corners of the favicon', () => {
    const listed = APP_ICONS.filter((i) => i.file.startsWith('public/'));
    expect(manifest.icons).toEqual(
      listed.map((i) => ({
        src: `/${i.file.slice('public/'.length)}`,
        sizes: `${i.size}x${i.size}`,
        type: 'image/png',
        purpose: 'any',
      })),
    );
    for (const i of listed) expect(png(i.file), i.file).toEqual({ width: i.size, height: i.size, colorType: 6 });
  });
});

describe('apple-icon.png', () => {
  it('is 180 px and opaque: iOS rounds the corners itself and paints see-through pixels black', () => {
    const apple = APP_ICONS.find((i) => i.file === 'src/app/apple-icon.png');
    expect(apple).toEqual({ file: 'src/app/apple-icon.png', size: 180, opaque: true });
    expect(png('src/app/apple-icon.png')).toEqual({ width: 180, height: 180, colorType: 2 });
  });
});
