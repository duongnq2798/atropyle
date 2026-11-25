import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/fonts';
import { Frame } from '@/shell/frame';
import { Providers } from '@/shell/providers';
import { BootScript } from '@/theme/boot-script';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Atropyle: inheritance and wallet recovery on X Layer', template: '%s · Atropyle' },
  description:
    'A vault for crypto inheritance and wallet recovery on X Layer. A circuit decides every step, and anyone can prove it.',
  applicationName: 'Atropyle',
  // iOS would otherwise turn long numbers (amounts, block numbers) into phone links.
  formatDetection: { telephone: false, address: false, email: false },
};

// Night whatever the device prefers (R18.1). The stylesheet sets color-scheme per theme; this meta only decides the
// canvas before the stylesheet applies, and the browser bar keeps the night colour under every theme.
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0d12',
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
