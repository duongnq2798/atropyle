// npm run site:check -- --target deweb|pages [--out <dir>]
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteArgs } from './lib/site-build';
import { siteProblems } from './lib/site-check';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = parseSiteArgs(process.argv.slice(2));
const dir = resolve(ROOT, args.dir);
const shown = dir.split(sep).join('/');
const problems = siteProblems(dir, args.target);
if (problems.length > 0) {
  for (const p of problems) console.error(`- ${p}`);
  console.error(`${problems.length} problem(s) in ${shown}`);
  process.exit(1);
}
console.log(`${shown}: OK for ${args.target}${args.target === 'deweb' ? ' (no external references)' : ''}`);
