import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}
interface VercelConfig {
  framework: unknown;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  headers: Rule[];
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const raw = read('../../../vercel.json');
const root = JSON.parse(raw) as VercelConfig;
/** The web v2 config; its page headers are the ones its e2e and Lighthouse servers send. */
const next = JSON.parse(read('../../../apps/web/vercel.json')) as VercelConfig;
const pageRule = (c: VercelConfig) => c.headers.find((h) => h.source === '/(.*)')?.headers;

describe('the root vercel.json (production, atropyle.xyz)', () => {
  it('installs from the lockfile, builds the SDK, then the web app at the root of site-dist/vercel', () => {
    expect(root.framework).toBeNull();
    expect(root.installCommand).toBe('npm ci');
    expect(root.buildCommand).toBe('npm run build && npm run site:build -- --target vercel --no-docs');
    expect(root.outputDirectory).toBe('site-dist/vercel');
  });

  it('sends every page the same hardening headers as web v2, so the switch-over changes no policy', () => {
    expect(pageRule(root)).toBeDefined();
    expect(pageRule(root)).toEqual(pageRule(next));
  });

  it('caches the hashed Vite assets for a year', () => {
    expect(root.headers.find((h) => h.source === '/assets/(.*)')?.headers).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });

  it('holds no secret and no backend URL', () => {
    expect(raw).not.toMatch(/supabase|token|secret|password|KEEPER|RESEND/i);
  });
});
