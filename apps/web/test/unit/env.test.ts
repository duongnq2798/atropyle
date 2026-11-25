import { getDeployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  apiUrlOf,
  chainIdOf,
  chainNameOf,
  explorerUrlOf,
  readEnv,
  targetOf,
  XLAYER_EXPLORER,
} from '../../src/config/env';

describe('env', () => {
  it('defaults to the deweb target and refuses unknown targets', () => {
    expect(targetOf(undefined)).toBe('deweb');
    expect(targetOf(' ')).toBe('deweb');
    expect(targetOf('deweb')).toBe('deweb');
    expect(targetOf('vercel')).toBe('vercel');
    expect(() => targetOf('pages')).toThrow(/vercel or deweb/);
  });

  it('defaults to X Layer and refuses unknown chains', () => {
    expect(chainNameOf(undefined)).toBe('xlayer');
    expect(chainNameOf('local')).toBe('local');
    expect(() => chainNameOf('mainnet')).toThrow(/xlayer or local/);
  });

  it('keeps the API URL only for the vercel target, https only, without a trailing slash', () => {
    const url = 'https://abc.supabase.co/functions/v1/';
    expect(apiUrlOf('deweb', url)).toBeNull();
    expect(apiUrlOf('vercel', url)).toBe('https://abc.supabase.co/functions/v1');
    expect(apiUrlOf('vercel', undefined)).toBeNull();
    expect(() => apiUrlOf('vercel', 'http://abc.supabase.co/functions/v1')).toThrow(/https/);
    expect(() => apiUrlOf('vercel', 'https://u:p@abc.supabase.co/f')).toThrow(/credentials/);
    expect(() => apiUrlOf('vercel', 'https://abc.supabase.co/f?x=1')).toThrow(/query/);
    expect(() => apiUrlOf('vercel', 'not a url')).toThrow(/not a URL/);
  });

  it('reads every build variable', () => {
    const env = readEnv({
      NEXT_PUBLIC_TARGET: 'vercel',
      NEXT_PUBLIC_CHAIN: 'local',
      NEXT_PUBLIC_DEPLOYMENT: '{"chainId":31337}',
      NEXT_PUBLIC_API_URL: 'https://abc.supabase.co/functions/v1',
      NEXT_PUBLIC_DOCS_PATH: '/docs/',
      NEXT_PUBLIC_APP_VERSION: '0.2.0',
    });
    expect(env).toEqual({
      target: 'vercel',
      chain: 'local',
      deploymentJson: '{"chainId":31337}',
      apiUrl: 'https://abc.supabase.co/functions/v1',
      docsPath: '/docs/',
      version: '0.2.0',
    });
    expect(readEnv({})).toEqual({
      target: 'deweb',
      chain: 'xlayer',
      deploymentJson: null,
      apiUrl: null,
      docsPath: null,
      version: '0.0.0',
    });
  });

  it('knows the chain id and explorer without loading the SDK', () => {
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: null })).toBe(196);
    expect(chainIdOf({ chain: 'local', deploymentJson: null })).toBe(31337);
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: '{"chainId":31337}' })).toBe(31337);
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: '{' })).toBe(196);
    expect(explorerUrlOf({ chain: 'xlayer', deploymentJson: null })).toBe(XLAYER_EXPLORER);
    expect(explorerUrlOf({ chain: 'local', deploymentJson: null })).toBeNull();
    expect(explorerUrlOf({ chain: 'local', deploymentJson: '{"explorerUrl":null}' })).toBeNull();
    expect(explorerUrlOf({ chain: 'local', deploymentJson: '{"explorerUrl":"javascript:alert(1)"}' })).toBeNull();
  });

  it('matches the explorer and chain id of the SDK deployment', () => {
    const d = getDeployment('xlayer');
    expect(XLAYER_EXPLORER).toBe(d.explorerUrl);
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: null })).toBe(d.chainId);
  });
});
