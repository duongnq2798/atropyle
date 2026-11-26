import type { TypedReason } from '@/flows/impl/sign-gate';

/** An address has 42 characters: shorter, and with the field not yet left, it is still being typed. */
const ADDRESS_LENGTH = 42;

/**
 * The reason to show under a typed address: none while the field is empty or still being typed, so neither the
 * field nor the live region interrupts the signer at every key.
 */
export function shownReason(
  reason: TypedReason | null,
  value: string,
  touched: boolean,
): Exclude<TypedReason, 'empty'> | null {
  if (reason === null || reason === 'empty') return null;
  return touched || value.trim().length >= ADDRESS_LENGTH ? reason : null;
}
