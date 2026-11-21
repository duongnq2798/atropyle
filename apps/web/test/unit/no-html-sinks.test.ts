import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sources = () => walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

describe('DOM safety', () => {
  it('no source file writes HTML strings into the DOM', () => {
    const sink = /dangerouslySetInnerHTML|\.innerHTML\b|\.outerHTML\s*=|insertAdjacentHTML|document\.write/;
    expect(sources().filter((f) => sink.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('no component uses inline styles, which the CSP blocks', () => {
    expect(sources().filter((f) => /\bstyle=["{]/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
