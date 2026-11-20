import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const BIN_ONLY = new Set(['bin.ts', 'bin-args.ts']);
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)],
  );

describe('root entry', () => {
  it('has no static node: import outside the bin files', () => {
    for (const f of files(SRC)) {
      const name = relative(SRC, f).replaceAll('\\', '/');
      if (BIN_ONLY.has(name)) continue;
      const text = readFileSync(f, 'utf8');
      expect(text, name).not.toMatch(/from\s+['"]node:/);
      expect(text, name).not.toMatch(/from\s+['"]@modelcontextprotocol\/server\/stdio['"]/);
    }
  });

  it('does not reach the bin files', () => {
    for (const f of files(SRC)) {
      const name = relative(SRC, f).replaceAll('\\', '/');
      if (name === 'bin.ts') continue;
      expect(readFileSync(f, 'utf8'), name).not.toMatch(/from\s+['"]\.\/bin(-args)?['"]/);
    }
  });
});
