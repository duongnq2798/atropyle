import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** X Layer RPC origins the app may call: the two OKX nodes, and dRPC for the opt-in cross-check (web v1, Plan 4). */
export const XLAYER_RPC_ORIGINS: readonly string[] = [
  'https://rpc.xlayer.tech',
  'https://xlayerrpc.okx.com',
  'https://xlayer.drpc.org',
];

/** `npm run devnet` listens here, like the SDK's built-in local deployment. */
export const LOCAL_RPC_ORIGINS: readonly string[] = ['http://127.0.0.1:8545'];

/** The build variables the policy depends on; a plain env record fits (run-next.ts passes buildEnvFor's result). */
export interface CspEnv {
  NEXT_PUBLIC_TARGET?: string;
  NEXT_PUBLIC_CHAIN?: string;
  NEXT_PUBLIC_DEPLOYMENT?: string;
  NEXT_PUBLIC_API_URL?: string;
}

/** The origin of every RPC URL in the deployment JSON; without one, the RPCs of the SDK deployment of the chain. */
export function rpcOrigins(chain: string | undefined, deploymentJson: string | undefined): string[] {
  if (deploymentJson?.trim()) {
    const d = JSON.parse(deploymentJson) as { rpcUrls?: unknown; quorumRpcUrls?: unknown };
    const groups = Array.isArray(d.quorumRpcUrls) ? (d.quorumRpcUrls as unknown[]).flat() : [];
    const urls: unknown[] = [...(Array.isArray(d.rpcUrls) ? d.rpcUrls : []), ...groups];
    return [...new Set(urls.filter((u): u is string => typeof u === 'string').map((u) => new URL(u).origin))];
  }
  return chain?.trim() === 'local' ? [...LOCAL_RPC_ORIGINS] : [...XLAYER_RPC_ORIGINS];
}

/** The backend origin: only in the vercel build, and only over https (spec §8). */
export function apiOrigin(target: string | undefined, apiUrl: string | undefined): string | null {
  const raw = apiUrl?.trim();
  if (target?.trim() !== 'vercel' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Every origin the pages of this build may fetch from, besides their own. */
export function connectOrigins(env: CspEnv): string[] {
  const api = apiOrigin(env.NEXT_PUBLIC_TARGET, env.NEXT_PUBLIC_API_URL);
  return [...rpcOrigins(env.NEXT_PUBLIC_CHAIN, env.NEXT_PUBLIC_DEPLOYMENT), ...(api ? [api] : [])];
}

// A <script> without a src attribute; `\s` before src, so that data-src="…" does not count as one.
const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;

/**
 * The text of every inline <script> of a page, in order, with CR LF and lone CR turned into LF: the HTML parser does
 * that before the browser hashes a script, so a page built on Windows still matches its policy.
 */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT)].map((m) => m[1].replace(/\r\n?/g, '\n'));
}

/** The CSP source of one inline script: SHA-256 of its UTF-8 text, in base64. */
export function scriptHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** Quyết định 12: the policy of one page. frame-ancestors only works in a header, so vercel.json carries it. */
export function buildCsp(o: { scriptHashes: readonly string[]; connect: readonly string[] }): string {
  return [
    "default-src 'self'",
    ['script-src', "'self'", ...new Set(o.scriptHashes)].join(' '),
    // Prerendered HTML carries style attributes (the first frame of motion, avatar colours) that no hash can cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    ['connect-src', "'self'", ...new Set(o.connect)].join(' '),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const META_CSP = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i;
const CHARSET = /<meta\s+charset\s*=\s*["']?utf-8["']?\s*\/?>/i;
const HEAD = /<head\b[^>]*>/i;

/** The page with its policy first in <head>, right after the charset, so that it governs every script below. */
export function withCsp(html: string, csp: string): string {
  if (/["<>&]/.test(csp)) throw new Error('a policy must not need escaping inside an HTML attribute');
  if (META_CSP.test(html)) throw new Error('the page already has a Content-Security-Policy meta tag');
  const at = CHARSET.exec(html) ?? HEAD.exec(html);
  if (!at) throw new Error('the page has no <head>');
  const end = at.index + at[0].length;
  return `${html.slice(0, end)}<meta http-equiv="Content-Security-Policy" content="${csp}"/>${html.slice(end)}`;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(path);
    return e.name.endsWith('.html') ? [path] : [];
  });
}

/** After `next build` (run-next.ts): each page gets a meta policy with the hashes of its own inline scripts. */
export function applyCsp(outDir: string, env: CspEnv): number {
  const connect = connectOrigins(env);
  const pages = htmlFiles(outDir);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    writeFileSync(page, withCsp(html, buildCsp({ scriptHashes: inlineScripts(html).map(scriptHash), connect })));
  }
  return pages.length;
}
