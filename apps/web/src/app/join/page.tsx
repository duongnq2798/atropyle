import type { Metadata } from 'next';
import { JoinPage } from './join-page';

// The layout's template adds " · Atropyle". An invitation names one person's vault: never indexed.
export const metadata: Metadata = {
  title: 'Your invitation',
  description: 'You have been named in an Atropyle vault. See what it means for you, and get an email when it matters.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <JoinPage />;
}
