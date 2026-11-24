import type { ReactNode } from 'react';
import { fontVariables } from '@/fonts';
import { Providers } from '@/shell/providers';
import './globals.css';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
