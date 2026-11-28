import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCS_ORIGIN } from '../../lib/site-docs';

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}
interface Redirect {
  source: string;
  has?: { type: string; value: string }[];
  destination: string;
  permanent: boolean;
}
interface VercelConfig {
  framework: unknown;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  trailingSlash?: boolean;
  cleanUrls?: boolean;
  redirects?: Redirect[];
  headers: Rule[];
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const raw = read('../../../vercel.json');
const root = JSON.parse(raw) as VercelConfig;
const webUrl = (JSON.parse(read('../../../deployments/xlayer.json')) as { webUrl: string }).webUrl;

describe('the root vercel.json (production, atropyle.xyz)', () => {
  it('installs from the lockfile, builds the SDK, then the web app and its docs at the root of site-dist/vercel', () => {
    expect(root.framework).toBeNull();
    expect(root.installCommand).toBe('npm ci');
    expect(root.buildCommand).toBe('npm run build && npm run site:build -- --target vercel --no-docs');
    expect(root.outputDirectory).toBe('site-dist/vercel');
  });

  it('names only what it needs: no analytics, no rewrites, no clean URLs', () => {
    expect(Object.keys(root).sort()).toEqual([
      'buildCommand',
      'framework',
      'headers',
      'installCommand',
      'outputDirectory',
      'redirects',
      'trailingSlash',
    ]);
    expect(root.trailingSlash).toBe(true);
    // cleanUrls would 308 /docs/reference/errors.html, the docsUrl of every SDK error, away from its path.
    expect(root.cleanUrls).toBeUndefined();
  });

  it('sends www to the apex with a 308, the host of DOCS_BASE_URL and deployment.webUrl', () => {
    expect(root.redirects).toEqual([
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.atropyle.xyz' }],
        destination: 'https://atropyle.xyz/:path*',
        permanent: true,
      },
    ]);
    expect(new URL(root.redirects?.[0]?.destination ?? '').origin).toBe(DOCS_ORIGIN);
    expect(new URL(webUrl).origin).toBe(DOCS_ORIGIN);
  });

  it('hardens every page as before the cutover, and caches the hashed Next assets for a year', () => {
    expect(root.headers.map((h) => h.source)).toEqual(['/(.*)', '/_next/static/(.*)']);
    expect(root.headers[0]?.headers).toEqual([
      {
        key: 'Content-Security-Policy',
        value: "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ]);
    expect(root.headers[1]?.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
  });

  it('holds no secret and no backend URL: those live in the Vercel project settings', () => {
    expect(raw).not.toMatch(/supabase|NEXT_PUBLIC_API_URL|token|secret|password|KEEPER|RESEND|analytics/i);
  });
});
