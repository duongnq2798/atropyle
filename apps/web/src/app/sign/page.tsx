import type { Metadata } from 'next';
import { SignPage } from './sign-page';

// The layout's template adds " · Atropyle". A signing link carries one person's request: never indexed.
export const metadata: Metadata = {
  title: 'Signing request',
  description: 'Check a signing request decoded again from its own calldata, then sign it in your wallet.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SignPage />;
}
