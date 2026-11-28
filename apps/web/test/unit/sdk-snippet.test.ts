// @vitest-environment node
import { readFileSync } from 'node:fs';
import * as sdk from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { SDK_SNIPPET } from '../../src/content/sdk-snippet';

const quickstart = readFileSync(new URL('../../../../examples/node-quickstart/index.mjs', import.meta.url), 'utf8');

describe('the SDK snippet on /developers/', () => {
  it('is ten lines that call the real SDK the way the node quickstart does', () => {
    expect(SDK_SNIPPET.split('\n')).toHaveLength(10);
    expect(SDK_SNIPPET).toContain("import { createAtropyle } from '@atropyle/sdk';");
    const atro = sdk.createAtropyle({ chain: 'xlayer' });
    const vault = atro.vault('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    expect(typeof vault.status).toBe('function');
    expect(typeof vault.prepare).toBe('function');
    expect(typeof atro.handoff.link).toBe('function');
    for (const call of ['vault.status()', "vault.prepare({ type: 'checkIn' }", 'atro.handoff.link(tx)']) {
      expect(SDK_SNIPPET).toContain(call);
      expect(quickstart).toContain(call);
    }
  });
});
