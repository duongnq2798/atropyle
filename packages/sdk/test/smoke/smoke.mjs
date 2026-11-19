// Imports the built package by its own name (Node self-reference), like a user would.
import { readFileSync } from 'node:fs';
import { createAtropyle, VERSION } from '@atropyle/sdk';
import { signLink } from '@atropyle/sdk/handoff';
import { planTemplate, validatePlan } from '@atropyle/sdk/plan';
import { quorumTransport } from '@atropyle/sdk/verify';

for (const [name, f] of Object.entries({ createAtropyle, signLink, validatePlan, quorumTransport })) {
  if (typeof f !== 'function') throw new Error(`ESM export ${name} is missing`);
}
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
if (VERSION !== pkg.version) throw new Error(`VERSION ${VERSION} differs from package.json ${pkg.version}`);
const checked = validatePlan(planTemplate('simple', { heirs: [{ account: `0x${'11'.repeat(20)}`, percent: 100 }] }));
if (!checked.ok) throw new Error(`ESM validatePlan rejected a valid plan: ${JSON.stringify(checked.issues)}`);
console.log(`esm ok ${VERSION}`);
