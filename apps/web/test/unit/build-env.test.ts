import { describe, expect, it } from 'vitest';
import { buildEnvFor } from '../../scripts/lib/build-env';

describe('build env', () => {
  it('always disables Next telemetry', () => {
    expect(buildEnvFor({}).NEXT_TELEMETRY_DISABLED).toBe('1');
  });

  it('defaults to deweb and drops the API URL there', () => {
    const env = buildEnvFor({ NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
    expect(env.NEXT_PUBLIC_TARGET).toBe('deweb');
    expect('NEXT_PUBLIC_API_URL' in env).toBe(false);
  });

  it('keeps the API URL for vercel', () => {
    const env = buildEnvFor({
      NEXT_PUBLIC_TARGET: 'vercel',
      NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
    });
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://x.supabase.co/functions/v1');
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
