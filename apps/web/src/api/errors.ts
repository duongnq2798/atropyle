import { type Lang, translate } from '@/i18n/core';
import { DOCS_BASE_URL, errorDocsUrl } from '@/lib/docs';
import { messages } from '@/messages/api.messages';
import type { ApiErrorCode } from './client';

type Key = keyof typeof messages.en;

/** The message and the hint of each code. Typed by ApiErrorCode, so a new code does not compile without words. */
const WORDS: Readonly<Record<ApiErrorCode, readonly [message: Key, hint: Key]>> = {
  INVALID_INPUT: ['invalidInput', 'invalidInputHint'],
  NOT_A_VAULT: ['notAVault', 'notAVaultHint'],
  RATE_LIMITED: ['rateLimited', 'rateLimitedHint'],
  TOKEN_INVALID: ['tokenInvalid', 'tokenInvalidHint'],
  UNAUTHORIZED: ['unauthorized', 'unauthorizedHint'],
  INTERNAL: ['internal', 'internalHint'],
  NETWORK: ['network', 'networkHint'],
  TIMEOUT: ['timeout', 'timeoutHint'],
  BAD_RESPONSE: ['badResponse', 'badResponseHint'],
  UNAVAILABLE: ['unavailable', 'unavailableHint'],
};

/** What ErrorBox shows for a backend error: the shape of ErrorDescription (src/tx/impl/describe.ts). */
export interface ApiErrorView {
  code: ApiErrorCode;
  message: string;
  hint: string;
  docsUrl: string;
  reason: null;
}

/**
 * The code of an ApiError (src/api/client.ts), or null for any other value. Read structurally, so the error view
 * does not pull the client into every page that can show an error.
 */
export function apiErrorCode(e: unknown): ApiErrorCode | null {
  if (!(e instanceof Error) || e.name !== 'ApiError') return null;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' && Object.hasOwn(WORDS, code) ? (code as ApiErrorCode) : null;
}

/**
 * A backend error in words chosen by its code alone. Its `message` never shows: it holds the request, and the
 * backend is not a source of text for the page. The docs link comes from the code too, as for an SDK error.
 */
export function describeApiError(code: ApiErrorCode, docsPath: string | null, lang: Lang): ApiErrorView {
  const [message, hint] = WORDS[code];
  const url = errorDocsUrl(code);
  const prefix = `${DOCS_BASE_URL}/`;
  return {
    code,
    message: translate(messages, lang, message),
    hint: translate(messages, lang, hint),
    // As localDocs (src/tx/impl/errors-view.ts): the docs of this site when it carries them.
    docsUrl: docsPath && url.startsWith(prefix) ? `${docsPath}${url.slice(prefix.length)}` : url,
    reason: null,
  };
}
