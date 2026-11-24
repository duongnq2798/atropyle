import { AtropyleError, parseSignLink, type SignPayload, signLink, untrusted } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { toSdkSignLink } from '../../src/routes';
import { decodeSendFailure, describeError } from '../../src/tx/impl';
import { toSignHref } from '../../src/tx/sign-href';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('decodeSendFailure', () => {
  it('reads which step failed and how many were confirmed before it', () => {
    const f = decodeSendFailure(new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } }));
    expect(f).toMatchObject({ index: 1, completed: 1, error: { code: 'USER_REJECTED' } });
  });

  it('treats a missing or nonsense count as unknown, never as progress', () => {
    expect(decodeSendFailure(new Error('socket hang up'))).toMatchObject({ index: null, completed: 0 });
    for (const details of [
      { index: -1, completed: -2 },
      { index: 1.5, completed: Number.NaN },
      { index: '1', completed: '2' },
    ]) {
      expect(decodeSendFailure(new AtropyleError('UNKNOWN', { details }))).toMatchObject({ index: null, completed: 0 });
    }
  });
});

describe('describeError', () => {
  it('keeps the revert reason apart from the message, and the docs link comes from the code', () => {
    const d = describeError(
      new AtropyleError('UNKNOWN', {
        message: 'The call reverted with a reason this SDK does not recognize.',
        details: { reason: untrusted('ERC20: transfer amount exceeds balance') },
      }),
      null,
    );
    expect(d.reason).toBe('ERC20: transfer amount exceeds balance');
    expect(d.message).not.toContain('ERC20');
    expect(describeError(new AtropyleError('NOT_OWNER'), '/docs/').docsUrl).toBe(
      '/docs/reference/errors.html#not_owner',
    );
    // A reason that is not an Untrusted value from the SDK is not shown at all.
    const raw = { code: 'NOT_OWNER', message: 'm', hint: 'h', details: { reason: 'raw text' } };
    expect(describeError(raw, null).reason).toBeNull();
  });
});

describe('toSignHref', () => {
  it('turns an SDK signing link into the sign page of this site, byte for byte', () => {
    const payload: SignPayload = {
      chainId: 196,
      from: A,
      steps: [{ to: B, data: `0x5c19a95c${'00'.repeat(32)}`, value: 1n }],
    };
    const sdkLink = signLink(payload, 'https://atropyle.example/');
    const href = toSignHref(sdkLink, 'https://atropyle.example');
    expect(href).toMatch(/^https:\/\/atropyle\.example\/sign\/#p=/);
    const hash = new URL(href ?? '').hash;
    expect(toSdkSignLink(hash)).toBe(new URL(sdkLink).hash);
    expect(parseSignLink(toSdkSignLink(hash))).toEqual(payload);
  });

  it('refuses anything that is not a signing link', () => {
    expect(toSignHref('https://atropyle.example/#/v/0xabc/verify', 'https://atropyle.example')).toBeNull();
    expect(toSignHref('https://atropyle.example/', 'https://atropyle.example')).toBeNull();
  });
});
