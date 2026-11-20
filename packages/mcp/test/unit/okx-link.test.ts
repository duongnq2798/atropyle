import { describe, expect, it } from 'vitest';
import { okxAppLink } from '../../src/ops/index';

const PREFIX = 'https://web3.okx.com/download?deeplink=';

describe('okxAppLink', () => {
  it('wraps an https signing link in the OKX App universal link, encoded twice', () => {
    const link = 'https://duongnq2798.github.io/atropyle/#/sign?p=AbC_-09';
    const out = okxAppLink(link) as string;
    expect(out.startsWith(PREFIX)).toBe(true);
    const deeplink = decodeURIComponent(out.slice(PREFIX.length));
    expect(deeplink).toBe(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(link)}`);
    expect(new URL(deeplink).searchParams.get('dappUrl')).toBe(link);
  });

  it('returns null for links that are not https', () => {
    expect(okxAppLink('http://localhost:5173/#/sign?p=x')).toBeNull();
  });
});
