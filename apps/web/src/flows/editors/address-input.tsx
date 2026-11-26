'use client';

import { type ReactNode, useState } from 'react';
import type { AddressIssue } from '@/flows/impl/address-check';
import type { FlowsImpl } from '@/flows/load';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/editors.messages';
import { Address } from '@/ui/address';
import { TextField } from '@/ui/text-field';

export interface AddressInputProps {
  flows: FlowsImpl;
  label: ReactNode;
  value: string;
  onChange(v: string): void;
  testId: string;
  /** Another row already has this address. */
  duplicate?: boolean;
  /** The plan check's sentence for this field, once the user tried to move on; it wins over the live hints. */
  error?: ReactNode;
  hint?: ReactNode;
  /** A control beside the field (the remove button). */
  action?: ReactNode;
}

/** `0x` and 40 hex digits: a field this long holds a whole address, so its mistake is named before it is left. */
const FULL_LENGTH = 42;

type LiveKey = 'addrInvalid' | 'addrChecksum' | 'addrZero' | 'addrDuplicate';

function liveKey(issue: AddressIssue | null, duplicate: boolean): LiveKey | null {
  if (issue === 'invalid') return 'addrInvalid';
  if (issue === 'checksum') return 'addrChecksum';
  if (issue === 'zero') return 'addrZero';
  return duplicate ? 'addrDuplicate' : null;
}

/**
 * A wallet address field. A valid address shows under it checksummed and drawn as every address is (Address: the
 * Ledger voice, two rows of five groups of four, the checksum capitals heavier), so a person can compare it group by
 * group with the one in their contact's wallet. The mistake (not an address, broken capitals, the zero address, a repeat) is named
 * once the field is left or holds a whole address, and said once in a polite region that is there from the first
 * paint: TextField's error is not live (7A parked item, rule 19).
 */
export function AddressInput({
  flows,
  label,
  value,
  onChange,
  testId,
  duplicate,
  error,
  hint,
  action,
}: AddressInputProps) {
  const t = useT(messages);
  const [left, setLeft] = useState(false);
  const issue = flows.addressIssue(value);
  const ready = left || value.trim().length >= FULL_LENGTH;
  const live = ready ? liveKey(issue, duplicate === true) : null;
  const checksummed = issue === null ? flows.checksumOf(value) : null;
  // text-ink: the groups are what is compared, the lead before them stays muted. A screen reader hears the lead and
  // the address once, whole (Address's hidden copy), through the field's aria-describedby.
  const drawn = checksummed ? (
    <>
      {t('addrGroupsLead')}
      {/* Its own line: Address is inline-flex, and cn does not merge a second display class into it. */}
      <span className="mt-1 block text-ink">
        <Address address={checksummed} copy={false} avatar={false} size="sm" />
      </span>
    </>
  ) : null;
  return (
    <div className="flex items-start gap-2">
      <TextField
        className="min-w-0 grow"
        label={label}
        value={value}
        mono
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        placeholder={'0x\u{2026}'}
        data-testid={testId}
        data-issue={error ? 'plan' : (live ?? undefined)}
        hint={drawn ?? hint}
        error={error ?? (live ? t(live) : undefined)}
        onBlur={() => setLeft(true)}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* pt-7 lines the button up with the input under its label. */}
      {action ? <div className="pt-7">{action}</div> : null}
      {/* Quiet while the plan check speaks for this field: the step's IssueList says it in its alert region. */}
      <span aria-live="polite" data-testid={`${testId}-live`} className="sr-only">
        {!error && live ? t(live) : ''}
      </span>
    </div>
  );
}
