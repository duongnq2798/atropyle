import type { ReactNode } from 'react';
import { fontVariables } from '@/fonts';
import './globals.css';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
