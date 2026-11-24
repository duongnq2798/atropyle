// @vitest-environment node
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { memoryKV } from '../../src/lib/store';
import { Address } from '../../src/ui/address';
import { ExternalLink } from '../../src/ui/external-link';
import { TooltipProvider } from '../../src/ui/tooltip';

const html = (node: ReactNode) =>
  renderToString(
    <KVProvider kv={memoryKV()}>
      <LangProvider>
        <TooltipProvider>{node}</TooltipProvider>
      </LangProvider>
    </KVProvider>,
  );

describe('prerendered HTML of the deweb build', () => {
  it('has no external link in it, only text', () => {
    const out = html(<ExternalLink href="https://github.com/duongnq2798/atropyle">Source code</ExternalLink>);
    expect(out).toContain('Source code');
    expect(out).not.toContain('<a');
    expect(out).not.toContain('github.com');
  });

  it('does not link an address to the explorer before the page runs', () => {
    const out = html(
      <Address address="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" explorer="https://www.oklink.com/xlayer" />,
    );
    expect(out).not.toContain('oklink.com');
  });
});
