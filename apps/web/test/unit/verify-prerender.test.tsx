import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerifyPage } from '../../src/app/verify/verify-page';
import { memoryKV } from '../../src/lib/store';
import { Providers } from '../../src/shell/providers';

const SITE = {
  version: '0.1.0',
  explorer: 'https://www.oklink.com/xlayer',
  cpu: '0x3333333333333333333333333333333333333333',
  quorumGroups: 2,
} as const;

describe('/verify/ before any script runs (§18.2 rule 6)', () => {
  it('names the page and gives the command that runs the same check, not the form', () => {
    const out = renderToString(
      <Providers kv={memoryKV()}>
        <VerifyPage site={SITE} />
      </Providers>,
    );
    expect(out).toContain('Is this vault real?');
    expect(out).toContain('data-testid="verify-noscript"');
    expect(out).toContain('npx -y atropyle@0.1.0 verify --vault &lt;address&gt;');
    expect(out).toContain('data-testid="verify-loading"');
  });

  it('holds the form too, for a visit without an address, and keeps it hidden without JavaScript (7B-P1)', () => {
    const out = renderToString(
      <Providers kv={memoryKV()}>
        <VerifyPage site={SITE} />
      </Providers>,
    );
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const empty = doc.querySelector('[data-first-paint="empty"]');
    const wait = doc.querySelector('[data-first-paint="wait"]');
    // The form: shown unless the boot script marked an address, never without JavaScript.
    expect(empty?.querySelector('[data-testid="verify-missing"]')).not.toBeNull();
    expect(empty?.className).toContain('[:root[data-hash=address]_&]:hidden');
    expect(empty?.className).toContain('[@media(scripting:none)]:hidden');
    // The frame with the command: shown for an address, and without JavaScript.
    expect(wait?.querySelector('[data-testid="verify-noscript"]')).not.toBeNull();
    expect(wait?.className.split(' ')[0]).toBe('hidden');
    expect(wait?.className).toContain('[@media(scripting:none)]:contents');
  });
});
