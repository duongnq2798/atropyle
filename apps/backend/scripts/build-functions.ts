import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

/** The eight Edge Functions of spec §9.2. Each has src/entry/<name>.ts and a block in supabase/config.toml. */
export const FUNCTIONS = ['subscribe', 'confirm', 'unsubscribe', 'me', 'stats', 'health', 'tick', 'integrity'] as const;
export type FunctionName = (typeof FUNCTIONS)[number];

/** Deno resolves npm: specifiers itself. The version matches apps/backend/package.json (a unit test compares). */
export const POSTGRES_SPECIFIER = 'npm:postgres@3.4.9';
/** Plan ruling 1: well under the 5 MB limit of a bundle that Supabase builds server-side (--use-api). */
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;

const BACKEND = fileURLToPath(new URL('../', import.meta.url));

/** postgres.js stays an import of the bundle: Deno loads it from npm, with its Node built-ins. */
const postgresFromNpm: Plugin = {
  name: 'postgres-from-npm',
  setup(b) {
    b.onResolve({ filter: /^postgres$/ }, () => ({ path: POSTGRES_SPECIFIER, external: true }));
  },
};

export interface BundleReport {
  name: FunctionName;
  /** Absolute path of <outDir>/<name>/index.js. */
  file: string;
  bytes: number;
  /** External imports left in the bundle, deduplicated. Only POSTGRES_SPECIFIER is allowed. */
  imports: string[];
  /** Source files inlined into the bundle, relative to apps/backend, with forward slashes. */
  inputs: string[];
}

/** Every reason a set of bundles must not be deployed; empty when they are fine. */
export function checkBundles(reports: readonly BundleReport[]): string[] {
  const problems: string[] = [];
  for (const r of reports) {
    if (r.bytes > MAX_BUNDLE_BYTES) {
      problems.push(`${r.name} is ${r.bytes} bytes, over the ${MAX_BUNDLE_BYTES} byte cap`);
    }
    for (const i of r.imports) {
      if (i !== POSTGRES_SPECIFIER)
        problems.push(`${r.name} imports ${i}; only ${POSTGRES_SPECIFIER} may stay external`);
    }
  }
  return problems;
}

/**
 * One esbuild run, one self-contained ESM file per function: <outDir>/<name>/index.js, with @atropyle/sdk, its
 * circuits and viem inlined. platform 'browser' keeps Node built-ins out (the SDK and circuits dist import none).
 * Throws when checkBundles finds a problem.
 */
export async function bundleFunctions(outDir: string): Promise<BundleReport[]> {
  mkdirSync(outDir, { recursive: true });
  const result = await build({
    absWorkingDir: BACKEND,
    entryPoints: Object.fromEntries(FUNCTIONS.map((name) => [`${name}/index`, `src/entry/${name}.ts`])),
    outdir: outDir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['worker', 'browser'],
    minify: true,
    charset: 'utf8',
    legalComments: 'eof',
    metafile: true,
    logLevel: 'silent',
    plugins: [postgresFromNpm],
  });
  const outputs = Object.entries(result.metafile.outputs);
  const reports = FUNCTIONS.map((name): BundleReport => {
    const found = outputs.find(([path]) => path.replace(/\\/g, '/').endsWith(`/${name}/index.js`));
    if (!found) throw new Error(`esbuild wrote no bundle for ${name}`);
    const [, out] = found;
    return {
      name,
      file: join(outDir, name, 'index.js'),
      bytes: out.bytes,
      imports: [...new Set(out.imports.filter((i) => i.external).map((i) => i.path))],
      inputs: Object.keys(out.inputs).map((i) => i.replace(/\\/g, '/')),
    };
  });
  const problems = checkBundles(reports);
  if (problems.length > 0) throw new Error(`The function bundles cannot be deployed:\n${problems.join('\n')}`);
  return reports;
}
