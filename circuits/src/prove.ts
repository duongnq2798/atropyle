import { buildAll } from './policy';
import { PROP_NAMES } from './properties';
import { verifyPolicy } from './verify';

const { program } = buildAll();
const r = verifyPolicy(program, {
  onProgress: (done, total) => process.stdout.write(`\r${((100 * done) / total).toFixed(0)}%`),
});
process.stdout.write('\n');
console.log(`AtropylePolicy v1: ${program.gateCount} gates, ${r.combos} combinations, ${r.ms.toFixed(0)} ms`);
PROP_NAMES.forEach((name, i) => console.log(`${name}: ${r.violations[i] === 0 ? 'PASS' : `FAIL (${r.violations[i]})`}`));
console.log(`P8: ${r.mismatches === 0 ? 'PASS' : `FAIL (${r.mismatches})`}`);
if (r.mismatches !== 0 || r.violations.some((x) => x !== 0)) {
  console.log(JSON.stringify(r.firstFailures, null, 2));
  process.exit(1);
}
