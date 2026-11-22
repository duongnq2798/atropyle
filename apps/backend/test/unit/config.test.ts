import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config';

const BASE: Record<string, string> = {
  SITE_URL: 'https://atropyle.test/',
  SUPABASE_URL: 'https://ref.supabase.co',
  MAIL_FROM: 'Atropyle <alerts@atropyle.test>',
  TOKEN_SECRET: 't'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
};
const envOf = (o: Record<string, string>) => (name: string) => o[name];

function problemsOf(env: Record<string, string>): { problems: string[]; message: string } {
  try {
    loadConfig(envOf(env));
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return { problems: (e as ConfigError).problems, message: (e as Error).message };
  }
  throw new Error('loadConfig accepted an incomplete environment');
}

describe('loadConfig', () => {
  it('reads the minimal set and derives the API URL from SUPABASE_URL', () => {
    expect(loadConfig(envOf(BASE))).toEqual({
      siteUrl: 'https://atropyle.test',
      siteHost: 'atropyle.test',
      allowedOrigins: ['https://atropyle.test'],
      apiUrl: 'https://ref.supabase.co/functions/v1',
      mailFrom: 'Atropyle <alerts@atropyle.test>',
      tokenSecret: 't'.repeat(32),
      cronSecret: 'c'.repeat(32),
      opsEmail: null,
      resendApiKey: null,
      rpcUrls: null,
      headMargin: 3,
      budgetMs: 50_000,
      maxBlocksPerRun: 2_000,
      stepBlocks: 500,
      keeperMaxTx: 20,
    });
  });

  it('takes the optional settings when they are set', () => {
    const c = loadConfig(
      envOf({
        ...BASE,
        API_URL: 'https://api.atropyle.test/functions/v1/',
        ALLOWED_ORIGINS: 'https://atropyle-git-main.vercel.app, https://preview.atropyle.test',
        RPC_URLS: 'https://rpc.xlayer.tech,https://xlayerrpc.okx.com',
        HEAD_MARGIN: '0',
        OPS_EMAIL: 'ops@atropyle.test',
        RESEND_API_KEY: 're_test_value',
      }),
    );
    expect(c.apiUrl).toBe('https://api.atropyle.test/functions/v1');
    expect(c.allowedOrigins).toEqual([
      'https://atropyle.test',
      'https://atropyle-git-main.vercel.app',
      'https://preview.atropyle.test',
    ]);
    expect(c.rpcUrls).toEqual(['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com']);
    expect(c).toMatchObject({ headMargin: 0, opsEmail: 'ops@atropyle.test', resendApiKey: 're_test_value' });
  });

  it('lists every problem and never prints a secret', () => {
    const { problems, message } = problemsOf({ SITE_URL: 'http://atropyle.test', TOKEN_SECRET: 'short-secret-value' });
    expect(problems).toEqual([
      'SITE_URL must be an https URL',
      'API_URL is not set',
      'MAIL_FROM is not set',
      'TOKEN_SECRET must be at least 32 characters',
      'CRON_SECRET must be at least 32 characters',
    ]);
    expect(message).not.toContain('short-secret-value');
  });

  it('rejects an allowed origin with a path and a head margin that is not a small whole number', () => {
    const { problems } = problemsOf({ ...BASE, ALLOWED_ORIGINS: 'https://a.test/app', HEAD_MARGIN: '2.5' });
    expect(problems).toEqual([
      'ALLOWED_ORIGINS entry https://a.test/app is not an origin like https://example.com',
      'HEAD_MARGIN must be a whole number from 0 to 100',
    ]);
  });
});
