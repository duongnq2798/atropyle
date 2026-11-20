import { AtropyleError, decodeError, TRANSPORT_ERROR_CODES } from '@atropyle/sdk';

/** A bad command line. JSON output uses the code INVALID_OPTIONS; the exit code is 2. */
export class UsageError extends AtropyleError {
  constructor(message: string, hint = 'Run atropyle --help, or atropyle <command> --help.') {
    super('INVALID_OPTIONS', { message, hint });
  }
}

export const EXIT = { ok: 0, error: 1, usage: 2, verification: 3, network: 4 } as const;

const USAGE = new Set<string>(['INVALID_OPTIONS', 'INVALID_ADDRESS']);
const VERIFY_ONLY = new Set<string>(['POLICY_UNAVAILABLE', 'NOT_VAULT']);

/** Decision 11. */
export function exitCodeForCode(code: string, command: string): number {
  if (USAGE.has(code)) return EXIT.usage;
  if ((TRANSPORT_ERROR_CODES as ReadonlySet<string>).has(code) || code === 'WRONG_CHAIN') return EXIT.network;
  if (code === 'POLICY_MISMATCH' || (command === 'verify' && VERIFY_ONLY.has(code))) return EXIT.verification;
  return EXIT.error;
}

export const exitCodeFor = (e: unknown, command: string): number => exitCodeForCode(decodeError(e).code, command);
