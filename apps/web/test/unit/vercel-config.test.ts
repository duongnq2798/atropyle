// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteHeaders, VERCEL_JSON } from '../../scripts/lib/site-headers';

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}
interface VercelConfig {
  framework: unknown;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  trailingSlash: boolean;
  headers: Rule[];
}

const raw = readFileSync(VERCEL_JSON, 'utf8');
const config = JSON.parse(raw) as VercelConfig;

describe('vercel.json', () => {
  it('installs and builds from the monorepo root, the SDK first, the vercel target into out/', () => {
    expect(config.framework).toBeNull();
    expect(config.installCommand).toBe('cd ../.. && npm ci');
    expect(config.buildCommand).toBe(
      'cd ../.. && npm run build && NEXT_PUBLIC_TARGET=vercel npm run build -w apps/web',
    );
    expect(config.outputDirectory).toBe('out');
    expect(config.trailingSlash).toBe(true);
  });

  it('sends only the directives a meta policy cannot carry, so the hashed meta CSP still decides scripts', () => {
    // A header with default-src or script-src would block the inline scripts it cannot hash (Quyết định 12).
    expect(siteHeaders()['content-security-policy']).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it('hardens every page and caches hashed assets for a year', () => {
    expect(siteHeaders()).toEqual({
      'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'cross-origin-opener-policy': 'same-origin',
    });
    expect(config.headers.find((h) => h.source === '/_next/static/(.*)')?.headers).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });

  it('holds no secret and no backend URL: those live in the Vercel project settings', () => {
    expect(raw).not.toMatch(/supabase|NEXT_PUBLIC_API_URL|token|secret|password/i);
  });

  it('refuses a config without a rule for every page', () => {
    expect(() => siteHeaders('{"headers":[]}')).toThrow(/no header rule/);
  });
});
