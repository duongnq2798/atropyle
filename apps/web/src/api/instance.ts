import { ENV, IS_VERCEL } from '@/config/env';
import { type ApiClient, createApiClient } from './client';

/**
 * The backend of the vercel build (spec §9.6). The deweb build has none: `IS_VERCEL` folds to false there, and its
 * bundle never holds the URL (test/build/api-url.test.ts, Quyết định 30).
 */
const API: ApiClient | null = IS_VERCEL && ENV.apiUrl ? createApiClient(ENV.apiUrl) : null;

/** A function rather than the constant, so a test can stand in a fake backend or none. */
export function getApi(): ApiClient | null {
  return API;
}
