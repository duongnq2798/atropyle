import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
