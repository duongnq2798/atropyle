/** The mark every app icon draws: the favicon, unchanged (test/unit/icon.test.tsx). */
export const ICON_SVG = new URL('../../src/app/icon.svg', import.meta.url);

export interface AppIcon {
  /** Relative to apps/web. */
  file: string;
  size: number;
  /**
   * Fill the corners with the icon's own night square. iOS rounds the corners of an apple-touch-icon itself and
   * paints transparent pixels black; a manifest icon keeps the favicon's rounded, transparent corners.
   */
  opaque: boolean;
}

/**
 * The PNG icons, rendered by scripts/og-image.ts and committed. The two under public/ are the icons of
 * public/manifest.webmanifest; src/app/apple-icon.png is the file Next links as the apple-touch-icon.
 */
export const APP_ICONS: readonly AppIcon[] = [
  { file: 'public/icon-192.png', size: 192, opaque: false },
  { file: 'public/icon-512.png', size: 512, opaque: false },
  { file: 'src/app/apple-icon.png', size: 180, opaque: true },
];
