import { AtropyleError, type AtropyleErrorJson, decodeError } from '@atropyle/sdk';
import type { Hex } from 'viem';

export interface SendFailure {
  error: AtropyleErrorJson;
  /** The step of the sent plan that failed, when the SDK says which. */
  index: number | null;
  /** Steps of that send confirmed on chain before it failed; a retry starts after them. */
  completed: number;
  /** The transaction the failed step went out in, when the SDK names it (it reverted, or its receipt was unread). */
  hash: Hex | null;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/**
 * `sendPlan` puts `index` and `completed` in the details of every failure, and `hash` when the step went out (it
 * reverted, or its receipt could not be read); anything else counts as nothing done.
 */
export function decodeSendFailure(e: unknown): SendFailure {
  const err = decodeError(e);
  const h = err.details?.hash;
  return {
    error: err.toJSON(),
    index: count(err.details?.index),
    completed: count(err.details?.completed) ?? 0,
    hash: typeof h === 'string' && HASH.test(h) ? (h as Hex) : null,
  };
}

/**
 * What the wallet gets in place of the next step once the page that started the plan is gone (useTxRunner): the
 * send stops there, as it does when the user declines.
 */
export function pageGone(): AtropyleError {
  return new AtropyleError('USER_REJECTED', { message: 'The page that started this plan is gone.' });
}
