import { decodeError } from '@atropyle/sdk';
import type { ApiErrorCode } from '@/api/client';
import { apiErrorCode, describeApiError } from '@/api/errors';
import { type ErrorView, errorView, isErrorJson } from './errors-view';

/** What ErrorBox shows. `reason`: the cleaned revert text of an unknown revert, which the SDK keeps out of `message`. */
export interface ErrorDescription extends Omit<ErrorView, 'code'> {
  /** An SDK code, or the code of a backend error (src/api/errors.ts). */
  code: ErrorView['code'] | ApiErrorCode;
  reason: string | null;
}

function reasonOf(details: Record<string, unknown> | undefined): string | null {
  const r = details?.reason;
  if (typeof r !== 'object' || r === null) return null;
  const u = r as { untrusted?: unknown; value?: unknown };
  return u.untrusted === true && typeof u.value === 'string' && u.value !== '' ? u.value : null;
}

export function describeError(e: unknown, docsPath: string | null): ErrorDescription {
  // The SDK's decoder would show an ApiError's message as UNKNOWN. In English here; ErrorBox words a backend error in
  // the reader's language before it asks this decoder (use-error-view.ts).
  const api = apiErrorCode(e);
  if (api) return describeApiError(api, docsPath, 'en');
  const json = isErrorJson(e) ? e : decodeError(e).toJSON();
  return { ...errorView(json, docsPath), reason: reasonOf(json.details) };
}
