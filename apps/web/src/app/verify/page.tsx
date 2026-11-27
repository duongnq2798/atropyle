import { VERSION } from '@atropyle/sdk';
import type { Metadata } from 'next';
import { loadDeployment } from '@/chain/impl/sdk';
import { ENV } from '@/config/env';
import { VerifyPage } from './verify-page';

// The layout's template adds " · Atropyle". One page for every vault: the address lives after the #, so there is
// nothing to index.
export const metadata: Metadata = {
  title: 'Verify a vault',
  description:
    'Check that an Atropyle vault is real, runs the proven rules and reads the same from two independent RPC operators.',
  robots: { index: false, follow: false },
};

/**
 * The SDK's VERSION and this build's deployment are read here, at build time, and reach the client page as strings
 * (as /developers/ does, ruling T10-R5 of 7C): no SDK code ships for them, and the command reads without JavaScript.
 */
export default function Page() {
  const d = loadDeployment(ENV);
  return (
    <VerifyPage
      site={{ version: VERSION, explorer: d.explorerUrl, cpu: d.cpu, quorumGroups: d.quorumRpcUrls.length }}
    />
  );
}
