// @vitest-environment node
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
    expect(out).not.toContain('verify-missing');
  });
});
