import { fileURLToPath } from 'node:url';

/** The built CLI. Kept apart from helpers.ts, which imports vitest, so globalSetup can use it. */
export const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));
