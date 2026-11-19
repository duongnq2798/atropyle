/** Docs site root (spec §10.1). Change here if the repo moves to another GitHub owner. */
export const DOCS_BASE_URL = 'https://duongnq2798.github.io/atropyle/docs';

export function errorDocsUrl(code: string): string {
  return `${DOCS_BASE_URL}/reference/errors.html#${code.toLowerCase()}`;
}
