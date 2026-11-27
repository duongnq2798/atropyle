// npm run site:build -- --target deweb|vercel [--no-docs] [--out <dir>]
// The static export of apps/web at the root of site-dist/<target>; vercel adds docs/ (error reference and CLI schemas),
// and the docs app goes under docs/ when the apps/docs workspace exists.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsEnv, hasDocsWorkspace, outDirProblem, parseSiteArgs, webEnv, webOutOf } from './lib/site-build';
import { siteProblems } from './lib/site-check';
import { writeSiteDocs } from './lib/site-docs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const posix = (p: string) => p.split(sep).join('/');

class Fail extends Error {
  constructor(
    message: string,
    readonly code = 2,
  ) {
    super(message);
  }
}

/** Runs `npm <args>`. Never passes an args array together with `shell: true` (Node DEP0190). */
function npm(args: string[], env: NodeJS.ProcessEnv): void {
  const execpath = env.npm_execpath;
  const r = execpath
    ? spawnSync(process.execPath, [execpath, ...args], { cwd: ROOT, env, stdio: 'inherit' })
    : spawnSync(`npm ${args.join(' ')}`, { cwd: ROOT, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    const why = r.error ? `: ${r.error.message}` : '';
    throw new Fail(`npm ${args.join(' ')} failed${why}`, r.status ?? 1);
  }
}

function main(): void {
  const args = parseSiteArgs(process.argv.slice(2));
  const out = resolve(ROOT, args.dir);
  const refused = outDirProblem(out, ROOT);
  if (refused) throw new Fail(refused);
  const docs = args.docs && hasDocsWorkspace(ROOT);
  if (args.docs && !docs) console.log('apps/docs does not exist yet: building the web app only.');

  npm(['run', 'build', '-w', 'apps/web'], webEnv(args.target, docs, process.env));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(webOutOf(ROOT), out, { recursive: true });
  if (docs) {
    npm(['run', 'build', '-w', 'apps/docs'], docsEnv(args.target, process.env));
    cpSync(join(ROOT, 'apps', 'docs', 'dist'), join(out, 'docs'), { recursive: true });
  }
  // DOCS_BASE_URL (packages/sdk/src/links.ts) is on the production host: its error reference and schemas live there.
  if (args.target === 'vercel') writeSiteDocs(out);

  const problems = siteProblems(out, args.target);
  if (problems.length > 0) {
    for (const p of problems) console.error(`- ${p}`);
    if (docs && args.target === 'deweb') {
      console.error('The docs are not DeWEB-clean yet. Rebuild with --no-docs to publish the web app only.');
    }
    throw new Fail(`${problems.length} problem(s) in ${posix(out)}`, 1);
  }
  const what = docs ? 'web + docs' : args.target === 'vercel' ? 'web + error reference and schemas' : 'web only';
  console.log(`${posix(out)}: ready for ${args.target} (${what})`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(e instanceof Fail ? e.code : 2);
}
