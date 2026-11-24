import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineScripts, scriptHash } from '../../scripts/lib/csp';
import { outOf } from './paths';

const META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/g;

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return pages(path);
    return e.name.endsWith('.html') ? [path] : [];
  });
}

function policies(html: string): { csp: string; at: number }[] {
  return [...html.matchAll(META)].map((m) => ({ csp: m[1], at: m.index ?? -1 }));
}

/** The sources of one directive of a policy. */
function sources(csp: string, directive: string): string[] {
  const found = csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return found ? found.slice(1) : [];
}

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} build`, () => {
    const out = outOf(target);
    const files = pages(out);

    it('every page carries exactly one policy, before its first script', () => {
      expect(files.length).toBeGreaterThanOrEqual(2);
      for (const file of files) {
        const html = readFileSync(file, 'utf8');
        const found = policies(html);
        expect(found, relative(out, file)).toHaveLength(1);
        const firstScript = html.search(/<script\b/i);
        if (firstScript !== -1) expect(found[0].at, relative(out, file)).toBeLessThan(firstScript);
      }
    });

    it('lets each page run its own inline scripts and nothing else', () => {
      for (const file of files) {
        const html = readFileSync(file, 'utf8');
        const scripts = sources(policies(html)[0].csp, 'script-src');
        expect(scripts[0], relative(out, file)).toBe("'self'");
        for (const s of scripts.slice(1)) expect(s, relative(out, file)).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
        for (const text of inlineScripts(html)) expect(scripts, relative(out, file)).toContain(scriptHash(text));
      }
    });
  });
}

describe('connect-src', () => {
  const home = (target: 'vercel' | 'deweb'): string =>
    policies(readFileSync(join(outOf(target), 'index.html'), 'utf8'))[0].csp;

  it('reaches the backend only from the vercel build', () => {
    expect(sources(home('vercel'), 'connect-src')).toContain('https://api.atropyle.invalid');
    expect(home('deweb')).not.toContain('atropyle.invalid');
  });

  it('allows the OKX nodes of X Layer in both builds', () => {
    for (const target of ['vercel', 'deweb'] as const) {
      expect(sources(home(target), 'connect-src')).toEqual(
        expect.arrayContaining(['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com']),
      );
    }
  });
});
