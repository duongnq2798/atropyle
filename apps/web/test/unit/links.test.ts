import { describe, expect, it } from 'vitest';
import { DOCS_BASE_URL } from '../../src/lib/docs';
import {
  docsHome,
  explorerAddress,
  explorerName,
  explorerTx,
  LICENSE_URL,
  REPO_URL,
  XLAYER_URL,
} from '../../src/lib/links';

describe('links', () => {
  it('builds explorer links', () => {
    expect(explorerAddress('https://www.oklink.com/xlayer/', '0xAb')).toBe(
      'https://www.oklink.com/xlayer/address/0xAb',
    );
    expect(explorerTx('https://www.oklink.com/xlayer', '0x12')).toBe('https://www.oklink.com/xlayer/tx/0x12');
    expect(explorerName('https://www.oklink.com/xlayer')).toBe('OKLink');
    expect(explorerName('http://127.0.0.1:1')).toBe('Explorer');
    expect(explorerName('not a url')).toBe('Explorer');
  });

  it('opens docs on the same site when the site has them', () => {
    expect(docsHome('/docs/')).toBe('/docs/');
    expect(docsHome(null)).toBe(`${DOCS_BASE_URL}/`);
  });

  it('points the footer at https pages only', () => {
    for (const url of [REPO_URL, LICENSE_URL, XLAYER_URL]) expect(new URL(url).protocol).toBe('https:');
  });
});
