import type { Metadata } from 'next';
import { MePage } from './me-page';

export const metadata: Metadata = {
  title: 'My vaults',
  // English, as the root layout's head: the static export serves one head for both languages.
  description:
    'The Atropyle vaults that name your wallet as owner, guardian or heir, read from the factory on X Layer.',
};

export default function Me() {
  return <MePage />;
}
