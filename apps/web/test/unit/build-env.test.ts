// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildEnvFor } from '../../scripts/lib/build-env';
import { connectOrigins, XLAYER_RPC_ORIGINS } from '../../scripts/lib/csp';
import { readEnv } from '../../src/config/env';

describe('build env', () => {
  it('always disables Next telemetry', () => {
    expect(buildEnvFor({}).NEXT_TELEMETRY_DISABLED).toBe('1');
  });

  it('defaults to deweb and blanks the API URL there, so that no .env file can set it', () => {
    const env = buildEnvFor({ NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
    expect(env.NEXT_PUBLIC_TARGET).toBe('deweb');
    // @next/env loads a .env key only when the variable is undefined; an empty string keeps it out (Quyết định 30).
    expect(env.NEXT_PUBLIC_API_URL).toBe('');
    expect(buildEnvFor({}).NEXT_PUBLIC_API_URL).toBe('');
  });

  it('keeps the API URL for vercel, and blanks it there when unset so that only the environment sets it', () => {
    const env = buildEnvFor({
      NEXT_PUBLIC_TARGET: 'vercel',
      NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
    });
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://x.supabase.co/functions/v1');
    expect(buildEnvFor({ NEXT_PUBLIC_TARGET: 'vercel' }).NEXT_PUBLIC_API_URL).toBe('');
  });

  // The CSP step reads the build environment, never a .env file, so the bundle must read the same one (Task 15).
  const BUILD_VARS = ['NEXT_PUBLIC_CHAIN', 'NEXT_PUBLIC_DEPLOYMENT', 'NEXT_PUBLIC_DOCS_PATH'] as const;

  it.each(BUILD_VARS)('blanks %s when unset, so that no .env file can set it', (key) => {
    for (const target of ['deweb', 'vercel']) {
      expect(buildEnvFor({ NEXT_PUBLIC_TARGET: target })[key]).toBe('');
    }
  });

  it.each([
    ['NEXT_PUBLIC_CHAIN', 'local'],
    ['NEXT_PUBLIC_DEPLOYMENT', '{"chainId":31337,"rpcUrls":["http://127.0.0.1:8545"]}'],
    ['NEXT_PUBLIC_DOCS_PATH', '/docs/'],
  ] as const)('keeps %s from the build environment', (key, value) => {
    for (const target of ['deweb', 'vercel']) {
      expect(buildEnvFor({ NEXT_PUBLIC_TARGET: target, [key]: value })[key]).toBe(value);
    }
  });

  it('the blanks read as the defaults, in the app and in the page CSP alike', () => {
    // A plain record, as buildApp passes it: ProcessEnv shares no declared key with CspEnv or RawEnv.
    const env: Readonly<Record<string, string | undefined>> = buildEnvFor({});
    expect(readEnv(env)).toMatchObject({ chain: 'xlayer', deploymentJson: null, apiUrl: null, docsPath: null });
    expect(connectOrigins(env)).toEqual([...XLAYER_RPC_ORIGINS]);
  });

  it('refuses an unknown target', () => {
    expect(() => buildEnvFor({ NEXT_PUBLIC_TARGET: 'pages' })).toThrow(/vercel or deweb/);
  });

  it('removes NODE_ENV, which Next sets itself, and never mutates its input', () => {
    const base = { NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' };
    const env = buildEnvFor(base);
    expect('NODE_ENV' in env).toBe(false);
    expect(base).toEqual({ NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
  });
});
