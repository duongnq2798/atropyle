import { Fragment } from 'react';
import { addressGroups } from '@/lib/address';
import { Digits } from '@/ui/digits';
import { VisuallyHidden } from '@/ui/visually-hidden';

/** A full address inside a sentence; split() keeps the captured addresses at the odd indices. */
const ADDRESS = /(0x[0-9a-fA-F]{40})/;

/**
 * An address within a line of text, in the Ledger voice and in groups of four like Address (spec §4.2), but inline:
 * no block cap and no buttons. Lines break only between groups (<wbr>), never inside one or after "0x". The drawn
 * groups are aria-hidden and a screen reader reads the address once, whole, from the hidden copy beside them.
 */
function InlineAddress({ address }: { address: string }) {
  const parts = addressGroups(address).map((text, at) => ({ text, at }));
  return (
    <span data-address={address} className="voice-ledger">
      <span aria-hidden="true" translate="no">
        {/* The gap trails each group, so a wrapped line starts flush with the text, not 0.45ch in. */}
        {parts.map((p) => (
          <Fragment key={p.at}>
            {p.at > 1 ? <wbr /> : null}
            <span
              className={p.at > 0 && p.at < parts.length - 1 ? 'me-[0.45ch] whitespace-nowrap' : 'whitespace-nowrap'}
            >
              {p.at > 0 ? <Digits group={p.text} /> : p.text}
            </span>
          </Fragment>
        ))}
      </span>
      <VisuallyHidden>
        {/* select-none: a selection across the drawn groups does not copy the address a second time. */}
        <span translate="no" className="select-none">
          {address}
        </span>
      </VisuallyHidden>
    </span>
  );
}

/**
 * The SDK's summary of a step, its addresses drawn in groups. The SDK builds it from templates of addresses and
 * numbers only (packages/sdk/src/prepare/summary.ts), so no chain text passes through here.
 */
export function SummaryText({ text }: { text: string }) {
  const parts = text.split(ADDRESS).map((part, at) => ({ part, at }));
  return (
    <>
      {parts.map((p) =>
        p.at % 2 === 1 ? <InlineAddress key={p.at} address={p.part} /> : <Fragment key={p.at}>{p.part}</Fragment>,
      )}
    </>
  );
}
