// Imports the built package by its own name (Node self-reference), like a user would.
import { createAtropyle, VERSION } from '@atropyle/sdk';
import { signLink } from '@atropyle/sdk/handoff';
import { validatePlan } from '@atropyle/sdk/plan';
import { quorumTransport } from '@atropyle/sdk/verify';

for (const [name, f] of Object.entries({ createAtropyle, signLink, validatePlan, quorumTransport })) {
  if (typeof f !== 'function') throw new Error(`ESM export ${name} is missing`);
}
console.log(`esm ok ${VERSION}`);
