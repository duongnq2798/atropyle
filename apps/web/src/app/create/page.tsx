import type { Metadata } from 'next';
import { Wizard } from './wizard';

// The layout's template adds " · Atropyle".
export const metadata: Metadata = {
  title: 'Create a vault',
  description:
    'Choose who receives your tokens on X Layer and when. Start with a Drill that runs in minutes, with no Atropyle fee, then sign.',
};

export default function CreatePage() {
  return <Wizard />;
}
