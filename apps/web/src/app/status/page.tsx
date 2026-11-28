import type { Metadata } from 'next';
import { StatusPage } from './status-page';

export const metadata: Metadata = {
  title: 'Status',
  description:
    'Live counts from the Atropyle contracts on X Layer, then the checks behind them: the contracts, the nodes this site reads through, and the backend.',
};

export default function Page() {
  return <StatusPage />;
}
