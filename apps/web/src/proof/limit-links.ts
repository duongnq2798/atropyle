import { REPO_URL } from '@/lib/links';

const BLOB = `${REPO_URL}/blob/main`;

/** Where each #limits row of /proof/ sends a reader. limit-links.test.ts checks that every file and heading exists. */
export const LIMIT_LINKS = {
  security: `${BLOB}/SECURITY.md`,
  staticAnalysis: `${BLOB}/docs/security/static-analysis.md`,
  tap02: `${BLOB}/circuits/test/tap-02/README.md`,
  knownLimits: `${BLOB}/contracts/README.md#known-limits`,
  verifyOptions: `${BLOB}/packages/cli/README.md#verify`,
  disappears: `${BLOB}/SECURITY.md#if-atropyle-disappears`,
} as const;
