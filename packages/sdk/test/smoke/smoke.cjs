// Same check through require(), for CommonJS users.
const { createAtropyle, VERSION } = require('@atropyle/sdk');
const { signLink } = require('@atropyle/sdk/handoff');
const { validatePlan } = require('@atropyle/sdk/plan');
const { quorumTransport } = require('@atropyle/sdk/verify');

for (const [name, f] of Object.entries({ createAtropyle, signLink, validatePlan, quorumTransport })) {
  if (typeof f !== 'function') throw new Error(`CJS export ${name} is missing`);
}
console.log(`cjs ok ${VERSION}`);
