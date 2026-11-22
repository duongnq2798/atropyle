import { DOCS_BASE_URL } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { docsHome, explorerAddress, explorerName, explorerTx, telegramLink } from '../../src/lib/links';

describe('links', () => {
  it('builds explorer links', () => {
    expect(explorerAddress('https://www.oklink.com/xlayer/', '0xAb')).toBe(
      'https://www.oklink.com/xlayer/address/0xAb',
    );
    expect(explorerTx('https://www.oklink.com/xlayer', '0x12')).toBe('https://www.oklink.com/xlayer/tx/0x12');
    expect(explorerName('https://www.oklink.com/xlayer')).toBe('OKLink');
    expect(explorerName('http://127.0.0.1:1')).toBe('Explorer');
  });

  it('builds the Telegram deep link with a lowercase vault', () => {
    expect(telegramLink('atropyle_bot', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'heir')).toBe(
      'https://t.me/atropyle_bot?start=0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc-heir',
    );
  });

  it('opens docs on the same site when the site has them', () => {
    expect(docsHome('./docs/')).toBe('./docs/');
    expect(docsHome(null)).toBe(`${DOCS_BASE_URL}/`);
  });
});
