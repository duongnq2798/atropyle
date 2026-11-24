import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSite } from '../../../../scripts/lib/onchain-check.ts';
import { contentTypeOf, walkSite } from '../../../../scripts/lib/site-files.ts';
import { outOf } from './paths';

describe('deweb build', () => {
  it('deweb HTML has no external attribute', () => {
    // The gateway's own static check (Quyết định 16): any src, href, action, srcset or CSS url() that leaves the
    // site costs the "100% on-chain" badge. The meta CSP lists RPC origins inside `content`, which it never reads.
    const root = outOf('deweb');
    const files = new Map(
      walkSite(root).map((path) => [path, { bytes: readFileSync(join(root, path)), contentType: contentTypeOf(path) }]),
    );
    expect(files.size).toBeGreaterThan(0);
    expect(scanSite(files).external).toEqual([]);
  });
});
