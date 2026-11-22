// npm run build -w apps/backend: bundles the eight Edge Functions into supabase/functions/<name>/index.js.
// Deploying them is the maintainer's step (apps/backend/README.md); this script never deploys.
import { fileURLToPath } from 'node:url';
import { bundleFunctions, MAX_BUNDLE_BYTES } from './scripts/build-functions';

const outDir = fileURLToPath(new URL('../../supabase/functions/', import.meta.url));
const reports = await bundleFunctions(outDir);
const kb = (n: number) => `${(n / 1024).toFixed(0).padStart(5)} kB`;
for (const r of reports) console.log(`${r.name.padEnd(12)} ${kb(r.bytes)}  imports ${r.imports.join(', ')}`);
console.log(`${reports.length} functions in ${outDir} (cap ${kb(MAX_BUNDLE_BYTES).trim()} each)`);
