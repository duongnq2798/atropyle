import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixLock, type Lockfile, missingDeps, npmView, serializeLock } from './lib/lockfile';

// npm on Windows drops @emnapi/core and @emnapi/runtime (optional wasm deps) from the lockfile, and `npm ci` on
// Linux then fails. Run this after every `npm install`.
const FILE = fileURLToPath(new URL('../package-lock.json', import.meta.url));
const fix = process.argv.includes('--fix');
const lock = JSON.parse(readFileSync(FILE, 'utf8')) as Lockfile;
const missing = missingDeps(lock);

if (missing.length === 0) {
  console.log('package-lock.json: every dependency resolves.');
  process.exit(0);
}
if (!fix) {
  for (const m of missing) console.error(`missing ${m.name}@${m.range} (needed by ${m.from || 'the root'})`);
  console.error('Run: npm run lockfile:check -- --fix');
  process.exit(1);
}
const r = fixLock(lock, npmView);
writeFileSync(FILE, serializeLock(r.lock));
for (const a of r.added) console.log(`added ${a}`);
if (r.missing.length > 0) {
  for (const m of r.missing) console.error(`still missing ${m.name}@${m.range}`);
  process.exit(1);
}
