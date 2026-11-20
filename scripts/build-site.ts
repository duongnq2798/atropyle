// npm run site:build -- --target deweb|pages [--no-docs] [--out <dir>]
// Web at the root of site-dist/<target>; docs under docs/ when the apps/docs workspace exists.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsEnv, hasDocsWorkspace, parseSiteArgs, webEnv } from './lib/site-build';
import { siteProblems } from './lib/site-check';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const posix = (p: string) => p.split(sep).join('/');

function npm(args: string[], env: NodeJS.ProcessEnv): void {
  const r = spawnSync('npm', args, { cwd: ROOT, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`npm ${args.join(' ')} failed`);
    process.exit(r.status ?? 1);
  }
}

const args = parseSiteArgs(process.argv.slice(2));
const out = resolve(ROOT, args.dir);
const docs = args.docs && hasDocsWorkspace(ROOT);
if (args.docs && !docs) console.log('apps/docs does not exist yet: building the web app only.');

npm(['run', 'build', '-w', 'apps/web'], webEnv(args.target, docs, process.env));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(ROOT, 'apps', 'web', 'dist'), out, { recursive: true });
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
  process.exit(1);
}
console.log(`${posix(out)}: ready for ${args.target}${docs ? ' (web + docs)' : ' (web only)'}`);
