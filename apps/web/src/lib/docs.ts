/** Copy of packages/sdk/src/links.ts (Quyết định 13; test/unit/sdk-copies.test.ts keeps them equal). */
export const DOCS_BASE_URL = 'https://atropyle.xyz/docs';

export function errorDocsUrl(code: string): string {
  return `${DOCS_BASE_URL}/reference/errors.html#${code.toLowerCase()}`;
}
