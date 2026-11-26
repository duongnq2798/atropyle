import type { Metadata } from 'next';
import { VaultPage } from './vault-page';

// The layout's template adds " · Atropyle". One page for every vault: the address lives after the #, so there is
// nothing to index.
export const metadata: Metadata = {
  title: 'Vault',
  description:
    'The state, the plan and the history of an Atropyle vault on X Layer, and what your wallet can do in it.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <VaultPage />;
}
