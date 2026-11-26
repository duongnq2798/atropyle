import type { Metadata } from 'next';
import { UnsubscribePage } from './unsubscribe-page';

export const metadata: Metadata = {
  title: 'Stop email alerts',
  description: 'Stop the email alerts of an Atropyle vault.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <UnsubscribePage />;
}
