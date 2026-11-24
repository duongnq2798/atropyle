import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixLock, type Lockfile, type Missing, missingDeps, npmView, serializeLock } from './lib/lockfile';

// npm on Windows drops @emnapi/core and @emnapi/runtime (optional wasm deps) from the lockfile, at the top level and
// in the packages that nest or bundle their own copy, and `npm ci` on Linux then fails. Run this after every
// `npm install`.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = fileURLToPath(new URL('../package-lock.json', import.meta.url));
const fix = process.argv.includes('--fix');
const lock = JSON.parse(readFileSync(FILE, 'utf8')) as Lockfile;
const missing = missingDeps(lock);

const describe = (m: Missing): string => {
  const need = `${m.name}@${m.range}${m.peer ? ' as a peer' : ''} (needed by ${m.from || 'the root'})`;
  return m.found ? `invalid ${need}: ${m.found} does not satisfy it` : `missing ${need}`;
};

/** The committed lockfile, the only source for a bundled entry; none outside a git checkout. */
function committed(): Lockfile | undefined {
  const r = spawnSync('git', ['show', 'HEAD:package-lock.json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  return r.status === 0 ? (JSON.parse(r.stdout) as Lockfile) : undefined;
}

if (missing.length === 0) {
  console.log('package-lock.json: every dependency resolves.');
  process.exit(0);
}
if (!fix) {
  for (const m of missing) console.error(describe(m));
  console.error('Run: npm run lockfile:check -- --fix');
  process.exit(1);
}
const r = fixLock(lock, npmView, { previous: committed() });
writeFileSync(FILE, serializeLock(r.lock));
for (const a of r.added) console.log(`added ${a}`);
if (r.missing.length > 0) {
  for (const m of r.missing) {
    console.error(`still ${describe(m)}`);
    if (m.bundled) {
      console.error(`  ${m.from} bundles it: copy its entry at ${m.at} from a package-lock.json that has it`);
    }
  }
  process.exit(1);
}
