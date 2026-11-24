// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDeployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  apiOrigin,
  applyCsp,
  buildCsp,
  connectOrigins,
  inlineScripts,
  rpcOrigins,
  scriptHash,
  withCsp,
  XLAYER_RPC_ORIGINS,
} from '../../scripts/lib/csp';

describe('csp', () => {
  it('hashes a script the way browsers do: SHA-256 of its UTF-8 text, base64', () => {
    expect(scriptHash('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(scriptHash('abc')).toBe("'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
    expect(scriptHash('alert("Ví")')).toBe("'sha256-hZIhXqlBP0tpUDcF8iB1nx6q2uQEGsvuP2dxYTRoCrg='");
  });

  it('reads every inline script, skips scripts with a src, and normalizes newlines like the HTML parser', () => {
    const html =
      '<head><script src="/_next/a.js" async=""></script><script>self.__next_f=[]</script></head>' +
      '<body><script data-src="x" id="b">a()</script><SCRIPT type="module">b()</SCRIPT ><script>c(1,\r\n2)\r</script></body>';
    expect(inlineScripts(html)).toEqual(['self.__next_f=[]', 'a()', 'b()', 'c(1,\n2)\n']);
  });

  it('takes RPC origins from the deployment JSON, else from the chain', () => {
    const json = JSON.stringify({
      rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com/'],
      quorumRpcUrls: [['https://rpc.xlayer.tech'], ['https://xlayer.drpc.org']],
    });
    expect(rpcOrigins('xlayer', json)).toEqual([
      'https://rpc.xlayer.tech',
      'https://xlayerrpc.okx.com',
      'https://xlayer.drpc.org',
    ]);
    expect(rpcOrigins('local', undefined)).toEqual(['http://127.0.0.1:8545']);
    expect(rpcOrigins(undefined, ' ')).toEqual([...XLAYER_RPC_ORIGINS]);
  });

  it('covers every RPC of the SDK deployment of X Layer', () => {
    const d = getDeployment('xlayer');
    for (const url of [...d.rpcUrls, ...d.quorumRpcUrls.flat()]) {
      expect(XLAYER_RPC_ORIGINS).toContain(new URL(url).origin);
    }
  });

  it('lets only the vercel build reach the backend, and only over https', () => {
    const url = 'https://abc.supabase.co/functions/v1';
    expect(apiOrigin('vercel', url)).toBe('https://abc.supabase.co');
    expect(apiOrigin('deweb', url)).toBeNull();
    expect(apiOrigin(undefined, url)).toBeNull();
    expect(apiOrigin('vercel', 'http://abc.supabase.co/functions/v1')).toBeNull();
    expect(apiOrigin('vercel', 'not a url')).toBeNull();
    expect(apiOrigin('vercel', '')).toBeNull();
    expect(
      connectOrigins({ NEXT_PUBLIC_TARGET: 'vercel', NEXT_PUBLIC_API_URL: url, NEXT_PUBLIC_CHAIN: 'local' }),
    ).toEqual(['http://127.0.0.1:8545', 'https://abc.supabase.co']);
    expect(
      connectOrigins({ NEXT_PUBLIC_TARGET: 'deweb', NEXT_PUBLIC_API_URL: url, NEXT_PUBLIC_CHAIN: 'local' }),
    ).toEqual(['http://127.0.0.1:8545']);
  });

  it('builds the policy of Quyết định 12', () => {
    expect(
      buildCsp({ scriptHashes: ["'sha256-a'", "'sha256-a'", "'sha256-b'"], connect: ['https://rpc.xlayer.tech'] }),
    ).toBe(
      "default-src 'self'; script-src 'self' 'sha256-a' 'sha256-b'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self'; connect-src 'self' https://rpc.xlayer.tech; worker-src 'self'; " +
        "manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it('puts the policy right after the charset, before any script, and only once', () => {
    const html = '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><script>x()</script></head></html>';
    const out = withCsp(html, "default-src 'self'");
    expect(out).toBe(
      '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>' +
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'"/><script>x()</script></head></html>`,
    );
    expect(withCsp('<html><head class="a"><script>x()</script></head></html>', "default-src 'self'")).toBe(
      `<html><head class="a"><meta http-equiv="Content-Security-Policy" content="default-src 'self'"/><script>x()</script></head></html>`,
    );
    expect(() => withCsp(out, "default-src 'self'")).toThrow(/already has/);
    expect(() => withCsp('<p>no head</p>', "default-src 'self'")).toThrow(/no <head>/);
    expect(() => withCsp('<head></head>', 'default-src "self"')).toThrow(/escaping/);
  });

  it('gives every page of a build the hashes of its own inline scripts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atropyle-csp-'));
    mkdirSync(join(dir, 'x'));
    writeFileSync(join(dir, 'index.html'), '<html><head><meta charset="utf-8"><script>a()</script></head></html>');
    writeFileSync(join(dir, 'x', 'index.html'), '<html><head><script>b()</script></head></html>');
    writeFileSync(join(dir, 'x', 'index.txt'), '<script>c()</script>');
    const env = { NEXT_PUBLIC_TARGET: 'vercel', NEXT_PUBLIC_API_URL: 'https://api.example.test/functions/v1' };
    expect(applyCsp(dir, env)).toBe(2);
    const home = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(home).toContain(scriptHash('a()'));
    expect(home).not.toContain(scriptHash('b()'));
    expect(home).toContain('https://xlayer.drpc.org https://api.example.test; worker-src');
    expect(readFileSync(join(dir, 'x', 'index.html'), 'utf8')).toContain(scriptHash('b()'));
    expect(readFileSync(join(dir, 'x', 'index.txt'), 'utf8')).toBe('<script>c()</script>');
    expect(() => applyCsp(dir, env)).toThrow(/already has/);
  });
});
