import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The production config, at the repository root (7C-T12): e2e and Lighthouse serve exactly its headers. */
export const VERCEL_JSON = fileURLToPath(new URL('../../../../vercel.json', import.meta.url));

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * The headers vercel.json sends with every page (its rule for "/(.*)"), keys in lower case. The local servers of e2e
 * and Lighthouse send them too, so the header policy and the meta policy of each page are tested together.
 */
export function siteHeaders(json: string = readFileSync(VERCEL_JSON, 'utf8')): Record<string, string> {
  const rules = (JSON.parse(json) as { headers?: HeaderRule[] }).headers ?? [];
  const rule = rules.find((h) => h.source === '/(.*)');
  if (!rule) throw new Error('vercel.json has no header rule for "/(.*)"');
  return Object.fromEntries(rule.headers.map((h) => [h.key.toLowerCase(), h.value]));
}
