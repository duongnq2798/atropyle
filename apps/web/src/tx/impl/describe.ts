import { decodeError } from '@atropyle/sdk';
import { type ErrorView, errorView, isErrorJson } from './errors-view';

/** What ErrorBox shows. `reason`: the cleaned revert text of an unknown revert, which the SDK keeps out of `message`. */
export interface ErrorDescription extends ErrorView {
  reason: string | null;
}

function reasonOf(details: Record<string, unknown> | undefined): string | null {
  const r = details?.reason;
  if (typeof r !== 'object' || r === null) return null;
  const u = r as { untrusted?: unknown; value?: unknown };
  return u.untrusted === true && typeof u.value === 'string' && u.value !== '' ? u.value : null;
}

export function describeError(e: unknown, docsPath: string | null): ErrorDescription {
  const json = isErrorJson(e) ? e : decodeError(e).toJSON();
  return { ...errorView(json, docsPath), reason: reasonOf(json.details) };
}
