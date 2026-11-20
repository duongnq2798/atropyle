import { type AtropyleClient, AtropyleError, type TxPlan } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { prepareCreateVault } from '../../src/ops/index';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as const;
const step = {
  chainId: 31337,
  from: A(1),
  to: A(2),
  data: '0x1234',
  value: 0n,
  action: 'checkIn',
  summary: 'Check in.',
  warnings: [],
  simulation: { ok: true, gas: 21000n },
} as const;

const noWebApp = () => {
  throw new AtropyleError('INVALID_OPTIONS', { message: 'This deployment has no web app URL; pass `base`.' });
};

function stub(o: { steps?: TxPlan['steps']; webUrl?: string | null; link?: () => string; cast?: () => string }) {
  const plan = { chainId: 31337, from: A(1), vault: A(9), steps: o.steps ?? [step], summary: 'Plan.', warnings: [] };
  return {
    deployment: { webUrl: o.webUrl ?? null },
    prepare: { createVault: async () => plan },
    handoff: {
      link: o.link ?? noWebApp,
      cast: o.cast ?? (() => 'cast send'),
      calls: () => ({ version: '2.0.0', chainId: '0x7a69', from: A(1), atomicRequired: false, calls: [] }),
    },
  } as unknown as AtropyleClient;
}
const input = { plan: { heirs: [], timing: 'drill' as const }, owner: A(1) };

describe('handoff edge cases', () => {
  it('a deployment without a web app URL still gives cast and calls, and says why there is no link', async () => {
    const out = await prepareCreateVault(stub({}), input);
    expect(out.handoff).toMatchObject({ link: null, okxAppLink: null, cast: ['cast send'] });
    expect(out.handoff?.notes.join(' ')).toContain('no web app URL');
  });

  it('rethrows INVALID_OPTIONS from the link when a web app URL exists', async () => {
    const badBase = () => {
      throw new AtropyleError('INVALID_OPTIONS', { message: 'The base of a signing link must be an http(s) URL.' });
    };
    await expect(
      prepareCreateVault(stub({ webUrl: 'http://localhost:5173', link: badBase }), input),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(prepareCreateVault(stub({ link: badBase }), { ...input, webUrl: 'ftp://nope' })).rejects.toMatchObject(
      {
        code: 'INVALID_OPTIONS',
      },
    );
  });

  it('does not swallow other errors from the link or from cast', async () => {
    const boom = () => {
      throw new AtropyleError('UNKNOWN');
    };
    await expect(prepareCreateVault(stub({ link: boom }), input)).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(prepareCreateVault(stub({ link: () => 'x', cast: boom }), input)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('a plan with no steps has no handoff and nothing to sign', async () => {
    const out = await prepareCreateVault(stub({ steps: [] }), input);
    expect(out.handoff).toBeNull();
    expect(out.blocked).toBeNull();
    expect(out.summary).toContain('nothing to sign');
  });
});
