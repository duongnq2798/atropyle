/**
 * The package the snippet imports, apart from the template: lazy-boundary.test reads a quoted `from '@atropyle/sdk'`
 * after an `export` as a runtime import of the SDK, and this module only holds text.
 */
const SDK_PACKAGE = '@atropyle/sdk';

/** Shown on /developers/. sdk-snippet.test.ts runs its calls against the real SDK and the node quickstart. */
export const SDK_SNIPPET = `import { createAtropyle } from '${SDK_PACKAGE}';

const atro = createAtropyle({ chain: 'xlayer' });
const vault = atro.vault('0xYourVaultAddress');

const status = await vault.status();
console.log(status.state, status.pending);

const tx = await vault.prepare({ type: 'checkIn' }, { as: '0xOwnerAddress' });
console.log(atro.handoff.link(tx)); // the owner opens it and signs in their own wallet`;
