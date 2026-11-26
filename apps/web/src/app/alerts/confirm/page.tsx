import type { Metadata } from 'next';
import { ConfirmPage } from './confirm-page';

// A confirmation link belongs to one person's email: never indexed.
export const metadata: Metadata = {
  title: 'Confirm email alerts',
  description: 'Confirm the email alerts of an Atropyle vault.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ConfirmPage />;
}
