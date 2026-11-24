import { QueryClient } from '@tanstack/react-query';

/** Errors that the same request will meet again (Quyết định 18): retrying only delays the message. */
export const PERMANENT_CODES: ReadonlySet<string> = new Set([
  'NOT_VAULT',
  'INVALID_ADDRESS',
  'DEPLOYMENT_INVALID',
  'DEPLOYMENT_MISSING',
  'LINK_INVALID',
  'PLAN_INVALID',
  'INVALID_OPTIONS',
  'USER_REJECTED',
  'WRONG_CHAIN',
  'WRONG_ACCOUNT',
  'POLICY_MISMATCH',
  'DRILL_EXPIRED',
  // The backend (src/api/client.ts): its answers to the same request do not change, and RATE_LIMITED only gets worse.
  'INVALID_INPUT',
  'NOT_A_VAULT',
  'RATE_LIMITED',
  'TOKEN_INVALID',
  'UNAUTHORIZED',
  'BAD_RESPONSE',
  'UNAVAILABLE',
]);

/** The `code` of an AtropyleError or an ApiError, read structurally so this file stays free of the SDK. */
export function errorCode(e: unknown): string | null {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && !PERMANENT_CODES.has(errorCode(error) ?? '');
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 15_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
