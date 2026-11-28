import type { Metadata } from 'next';
import { PrivacyPage } from './privacy-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Atropyle keeps about you, and where: no cookies or trackers, and email alerts only if you ask for them.',
};

export default function Page() {
  return <PrivacyPage />;
}
