import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { outOf } from './paths';

const PUBLIC_MANIFEST = fileURLToPath(new URL('../../public/manifest.webmanifest', import.meta.url));
const sizeOf = (png: Buffer) => `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;

describe.each(['vercel', 'deweb'] as const)('%s build', (target) => {
  const read = (file: string) => readFileSync(join(outOf(target), file));

  it('links the manifest and the Apple icon on every page', () => {
    for (const page of ['index.html', 'proof/index.html', '404.html']) {
      const html = read(page).toString('utf8');
      expect(html, page).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
      expect(html, page).toMatch(/<link rel="apple-touch-icon" href="\/apple-icon\.png(\?[^"]*)?"/);
    }
  });

  it('serves the manifest as committed, every icon it names at its stated size, and the Apple icon', () => {
    const manifest = read('manifest.webmanifest');
    expect(manifest.equals(readFileSync(PUBLIC_MANIFEST))).toBe(true);
    const { icons } = JSON.parse(manifest.toString('utf8')) as { icons: { src: string; sizes: string }[] };
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(sizeOf(read(icon.src.slice(1))), icon.src).toBe(icon.sizes);
    expect(sizeOf(read('apple-icon.png'))).toBe('180x180');
  });
});
