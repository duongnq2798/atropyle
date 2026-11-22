import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleSource, renderAll } from '../emails/render';

// npm run emails -w apps/backend         writes src/email/templates.gen.ts
// npm run emails:check -w apps/backend   fails when the committed file is stale
const out = fileURLToPath(new URL('../src/email/templates.gen.ts', import.meta.url));
const source = moduleSource(await renderAll());

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    current = '';
  }
  if (current !== source) {
    console.error('src/email/templates.gen.ts is stale: run `npm run emails -w apps/backend` and commit it.');
    process.exit(1);
  }
  console.log('src/email/templates.gen.ts is up to date');
} else {
  writeFileSync(out, source);
  console.log(`wrote ${out}`);
}
