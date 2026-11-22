import { getDeployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { buildCsp, rpcOrigins, targetOf, workerOrigin, XLAYER_RPC_ORIGINS } from '../../build/csp';

function xlayerUrls(): string[] | null {
  try {
    const d = getDeployment('xlayer');
    return [...d.rpcUrls, ...d.quorumRpcUrls.flat()];
  } catch {
    return null;
  }
}

// getDeployment('xlayer') throws only in a checkout without deployments/xlayer.json (before the mainnet deployment).
const xlayer = xlayerUrls();

describe('csp', () => {
  it('reads the target', () => {
    expect(targetOf('deweb')).toBe('deweb');
    expect(targetOf(undefined)).toBe('pages');
    expect(targetOf('other')).toBe('pages');
  });

  it('allows the Worker only in the Pages build, and only over https', () => {
    expect(workerOrigin('deweb', 'https://w.example.workers.dev/x')).toBeNull();
    expect(workerOrigin('pages', 'https://w.example.workers.dev/x')).toBe('https://w.example.workers.dev');
    expect(workerOrigin('pages', 'http://w.example')).toBeNull();
    expect(workerOrigin('pages', undefined)).toBeNull();
  });

  it('takes RPC origins from a deployment JSON when one is given', () => {
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
    expect(rpcOrigins('xlayer', undefined)).toEqual([...XLAYER_RPC_ORIGINS]);
  });

  it('builds a strict policy', () => {
    expect(buildCsp({ rpcOrigins: ['https://rpc.xlayer.tech'], workerOrigin: null })).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self' https://rpc.xlayer.tech; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
    expect(buildCsp({ rpcOrigins: [], workerOrigin: 'https://w.example' })).toContain(
      "connect-src 'self' https://w.example;",
    );
  });

  it.skipIf(xlayer === null)('covers every RPC of the X Layer deployment', () => {
    for (const u of xlayer ?? []) expect(XLAYER_RPC_ORIGINS).toContain(new URL(u).origin);
  });
});
