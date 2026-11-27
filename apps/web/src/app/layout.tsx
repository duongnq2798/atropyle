import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ENV } from '@/config/env';
import { SHARE } from '@/config/share';
import { shareMetadata } from '@/config/share-metadata';
import { fontVariables } from '@/fonts';
import { Frame } from '@/shell/frame';
import { Providers } from '@/shell/providers';
import { BootScript } from '@/theme/boot-script';
import './globals.css';
import '@/home/home.css';

export const metadata: Metadata = {
  title: { default: SHARE.title, template: '%s · Atropyle' },
  description: SHARE.description,
  applicationName: 'Atropyle',
  // public/manifest.webmanifest on every build: it names only paths on the site (test/unit/app-icons.test.ts).
  manifest: '/manifest.webmanifest',
  // The card every page starts from, without og:url: a page with its own URL to share sets the card itself (page.tsx).
  ...shareMetadata(ENV.target),
  // iOS would otherwise turn long numbers (amounts, block numbers) into phone links.
  formatDetection: { telephone: false, address: false, email: false },
};

// Vellum whatever the device prefers (7C-T12). The stylesheet sets color-scheme per theme; this meta only decides the
// canvas before the stylesheet applies, and the browser bar keeps the vellum colour under every theme (7C-T12 Ruling 10).
export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f1e7',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <head>
        <BootScript />
      </head>
      <body>
        <Providers>
          <Frame>{children}</Frame>
        </Providers>
      </body>
    </html>
  );
}
