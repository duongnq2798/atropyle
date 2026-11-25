// npm run site:build -- --target deweb|pages|vercel [--no-docs] [--out <dir>]
// Web at the root of site-dist/<target>; docs under docs/ when the apps/docs workspace exists.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsEnv, hasDocsWorkspace, outDirProblem, parseSiteArgs, webEnv } from './lib/site-build';
import { siteProblems } from './lib/site-check';

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

  npm(['run', 'build', '-w', 'apps/web-legacy'], webEnv(args.target, docs, process.env));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(ROOT, 'apps', 'web-legacy', 'dist'), out, { recursive: true });
  if (docs) {
    npm(['run', 'build', '-w', 'apps/docs'], docsEnv(args.target, process.env));
    cpSync(join(ROOT, 'apps', 'docs', 'dist'), join(out, 'docs'), { recursive: true });
  }
  if (args.target === 'pages') writeFileSync(join(out, '.nojekyll'), '');

  const problems = siteProblems(out, args.target);
  if (problems.length > 0) {
    for (const p of problems) console.error(`- ${p}`);
    if (docs && args.target === 'deweb') {
      console.error(
        'The docs are not DeWEB-clean yet. Rebuild with --no-docs to publish the web app only; docs stay on Pages.',
      );
    }
    throw new Fail(`${problems.length} problem(s) in ${posix(out)}`, 1);
  }
  console.log(`${posix(out)}: ready for ${args.target}${docs ? ' (web + docs)' : ' (web only)'}`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(e instanceof Fail ? e.code : 2);
}
