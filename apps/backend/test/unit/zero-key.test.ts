import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Everything that ships or builds. build.ts arrives in Task 11; a missing path is simply skipped. */
const SOURCES = ['src', 'emails', 'scripts', 'build.ts'];

function files(p: string): string[] {
  const full = join(ROOT, p);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((f) => files(join(p, f)));
}

describe('zero keys (AGENTS.md)', () => {
  const all = SOURCES.flatMap(files)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(join(ROOT, f), 'utf8') }));

  it('reads KEEPER_KEY and builds an account from a key in exactly one file', () => {
    const hits = all.filter((f) => /privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|KEEPER_KEY/.test(f.text));
    expect(hits.map((f) => f.file)).toEqual(['src/keeper/signer.ts']);
  });

  it('has no PRIVATE_KEY variable and never sends a raw transaction itself', () => {
    for (const f of all) {
      expect(f.text, f.file).not.toMatch(/PRIVATE_KEY|sendRawTransaction|eth_sendRawTransaction|seed phrase|mnemonic/i);
    }
  });
});
