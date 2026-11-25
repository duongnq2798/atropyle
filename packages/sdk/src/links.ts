/**
 * Docs root on the production site. `npm run site:build -- --target vercel` writes the pages behind it:
 * reference/errors.html (one anchor per error code) and schemas/*.json (scripts/lib/site-docs.ts).
 */
export const DOCS_BASE_URL = 'https://atropyle.xyz/docs';

export function errorDocsUrl(code: string): string {
  return `${DOCS_BASE_URL}/reference/errors.html#${code.toLowerCase()}`;
}
