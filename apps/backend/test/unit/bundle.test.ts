import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BundleReport,
  bundleFunctions,
  checkBundles,
  FUNCTIONS,
  MAX_BUNDLE_BYTES,
  POSTGRES_SPECIFIER,
} from '../../scripts/build-functions';

const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const CONFIG_TOML = fileURLToPath(new URL('../../../../supabase/config.toml', import.meta.url));

describe('function bundles (spec §9.2, plan ruling 1)', () => {
  let dir: string;
  let reports: BundleReport[];
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'atropyle-functions-'));
    reports = await bundleFunctions(dir);
  }, 120_000);
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('bundles each function with the SDK inlined and only postgres left as an import', () => {
    expect(reports.map((r) => r.name)).toEqual([...FUNCTIONS]);
    for (const r of reports) {
      expect(r.file).toBe(join(dir, r.name, 'index.js'));
      expect(r.imports).toEqual([POSTGRES_SPECIFIER]);
      expect(r.inputs.some((i) => i.includes('sdk/dist/'))).toBe(true);
      expect(r.inputs).toContain(`src/entry/${r.name}.ts`);
      expect(r.inputs).toContain(`src/functions/${r.name}.ts`);
    }
  });

  it('keeps test-only and build-time packages out of every bundle', () => {
    for (const r of reports) {
      const leaked = r.inputs.filter(
        (i) =>
          /node_modules\/(@electric-sql|react|react-dom|@react-email|esbuild)\//.test(i) ||
          i.startsWith('emails/') ||
          i.startsWith('test/'),
      );
      expect(leaked, r.name).toEqual([]);
    }
  });

  it('stays under the 4 MB cap and serves through Deno.serve', () => {
    for (const r of reports) {
      expect(r.bytes, r.name).toBeLessThan(MAX_BUNDLE_BYTES);
      const code = readFileSync(r.file, 'utf8');
      expect(code).toContain('Deno.serve(');
      expect(code).toContain(POSTGRES_SPECIFIER);
    }
    expect(checkBundles(reports)).toEqual([]);
  });

  it('names an oversized bundle and a stray import', () => {
    const base: BundleReport = { name: 'tick', file: 'x', bytes: 10, imports: [POSTGRES_SPECIFIER], inputs: [] };
    expect(
      checkBundles([
        { ...base, bytes: MAX_BUNDLE_BYTES + 1 },
        { ...base, name: 'me', imports: [POSTGRES_SPECIFIER, 'node:fs'] },
      ]),
    ).toEqual([
      `tick is ${MAX_BUNDLE_BYTES + 1} bytes, over the ${MAX_BUNDLE_BYTES} byte cap`,
      'me imports node:fs; only npm:postgres@3.4.9 may stay external',
    ]);
  });
});

describe('function sources and Supabase config', () => {
  it('has one entry file per function and pins the same postgres as package.json', () => {
    const entries = readdirSync(join(BACKEND, 'src/entry'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'runtime.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    expect(entries).toEqual([...FUNCTIONS].sort());
    const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(`npm:postgres@${pkg.dependencies.postgres}`).toBe(POSTGRES_SPECIFIER);
  });

  it('declares every function in supabase/config.toml, public and pointing at its bundle', () => {
    const toml = readFileSync(CONFIG_TOML, 'utf8').replace(/\r\n/g, '\n');
    expect(toml.match(/^\[functions\./gm)).toHaveLength(FUNCTIONS.length);
    for (const name of FUNCTIONS) {
      expect(toml).toContain(
        `[functions.${name}]\nenabled = true\nverify_jwt = false\nentrypoint = "./functions/${name}/index.js"\n`,
      );
    }
  });
});
