import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IS_VERCEL } from '../../src/config/env';
import { memoryKV } from '../../src/lib/store';
import { Providers } from '../../src/shell/providers';
import { ExternalLink } from '../../src/ui/external-link';

describe('ExternalLink before mount on DeWEB (7B-P1)', () => {
  it('draws its arrow before the link comes, so the text keeps its width when the page mounts', () => {
    expect(IS_VERCEL).toBe(false);
    const out = renderToString(
      <Providers kv={memoryKV()}>
        <ExternalLink href="https://web3.okx.com/xlayer">X Layer</ExternalLink>
      </Providers>,
    );
    const span = new DOMParser().parseFromString(out, 'text/html').querySelector('[data-external="pending"]');
    expect(span?.textContent).toBe('X Layer');
    expect(span?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(out).not.toContain('href="https://web3.okx.com');
  });

  it('draws no arrow for a refused URL or an icon-only link', () => {
    const refused = 'javascript:alert(1)';
    const out = renderToString(
      <Providers kv={memoryKV()}>
        <ExternalLink href={refused}>bad</ExternalLink>
        <ExternalLink href="https://web3.okx.com/xlayer" icon={false}>
          plain
        </ExternalLink>
      </Providers>,
    );
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.querySelector('[data-external="refused"] svg')).toBeNull();
    expect(doc.querySelector('[data-external="pending"] svg')).toBeNull();
  });
});
