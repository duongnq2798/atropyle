import { Fragment } from 'react';
import { caseRuns } from '@/lib/address';

/**
 * A group of hex digits in the Ledger voice: the checksum capitals at weight 650, the rest at the 400 of the voice.
 * Its own file, so the account button in the header draws the short address the same way without loading the rest
 * of address.tsx into every page's first load (R23).
 */
export function Digits({ group }: { group: string }) {
  return (
    <>
      {caseRuns(group).map((r) =>
        r.upper ? (
          <span key={r.at} data-case="upper" className="font-[650]">
            {r.text}
          </span>
        ) : (
          <Fragment key={r.at}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}
