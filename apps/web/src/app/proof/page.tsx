import type { Metadata } from 'next';
import { formatCount } from '@/lib/count';
import { P9_CASES } from '@/proof/certificate';
import { TOTAL_CASES } from '@/proof/paint';
import { ProofPage } from './proof-page';

export const metadata: Metadata = {
  title: 'The proof',
  // Spec §18.2 rule 3: the numbers come from the constants the page shows (proof-messages.test.ts). English, as the
  // root layout's head: the static export serves one head for both languages.
  description: `Your browser reads the Atropyle policy circuit from X Layer and checks all ${formatCount(TOTAL_CASES, 'en')} cases a vault can meet, then asks the processor itself ${P9_CASES} random cases. What the proof does not cover is listed next to it.`,
};

export default function Proof() {
  return <ProofPage />;
}
