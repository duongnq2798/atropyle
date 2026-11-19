// Same check through require(), for CommonJS users.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createAtropyle, VERSION } = require('@atropyle/sdk');
const { signLink } = require('@atropyle/sdk/handoff');
const { planTemplate, validatePlan } = require('@atropyle/sdk/plan');
const { quorumTransport } = require('@atropyle/sdk/verify');

for (const [name, f] of Object.entries({ createAtropyle, signLink, validatePlan, quorumTransport })) {
  if (typeof f !== 'function') throw new Error(`CJS export ${name} is missing`);
}
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
if (VERSION !== pkg.version) throw new Error(`VERSION ${VERSION} differs from package.json ${pkg.version}`);
const checked = validatePlan(planTemplate('simple', { heirs: [{ account: `0x${'11'.repeat(20)}`, percent: 100 }] }));
if (!checked.ok) throw new Error(`CJS validatePlan rejected a valid plan: ${JSON.stringify(checked.issues)}`);
console.log(`cjs ok ${VERSION}`);
