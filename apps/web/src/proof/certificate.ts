import { COMMANDS, verifyWithSeed } from '@/content/commands';
import { format, type Lang } from '@/i18n/core';
import { formatCount } from '@/lib/count';
import { messages } from '@/messages/proof.messages';
import type { PolicyVerification } from '@/verify/types';
import { TOTAL_CASES } from './paint';

/** P9_VECTORS of the SDK, as a literal: shared src never imports an SDK value (certificate.test.ts ties the two). */
export const P9_CASES = 64;

export const CERTIFICATE_LINES = 8;

/** X Layer mainnet: the only chain whose name the certificate states. */
const XLAYER = 196;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KECCAK = /^0x[0-9a-fA-F]{64}$/;

/**
 * Spec §18.4.3 (Task 3): the certificate of a passed full proof, eight lines from a fixed template in the reader's
 * language. It carries no text read from the chain (no issue, warning, revert reason or token name): only an address
 * and a hash that match their shape, numbers, the P9 seed drawn on this device, and the command that checks it all
 * again. null for anything else (a failed or partial run, another chain, a netlist that does not match the source and
 * the record, a value of the wrong shape), so the page offers nothing to copy.
 */
export function certificateLines(r: PolicyVerification, lang: Lang): string[] | null {
  const policy = r.netlists.find((n) => n.role === 'policy');
  if (!r.ok || r.issues.length > 0 || r.combos !== TOTAL_CASES || r.chainId !== XLAYER) return null;
  if (!policy?.matchesSource || policy.matchesDeployment !== true) return null;
  if (!ADDRESS.test(r.cpu) || !KECCAK.test(policy.keccak)) return null;
  if (
    typeof r.policyId !== 'bigint' ||
    typeof r.blockNumber !== 'bigint' ||
    !Number.isSafeInteger(r.rpcs) ||
    r.rpcs < 1
  ) {
    return null;
  }
  const p9 = r.p9;
  if (p9 && (!p9.ok || typeof p9.seed !== 'bigint' || !Number.isSafeInteger(p9.vectors))) return null;
  const m = messages[lang];
  const total = formatCount(TOTAL_CASES, lang);
  return [
    format(m.cert1, { policyId: r.policyId.toString(10), cpu: r.cpu }),
    format(m.cert2, { keccak: policy.keccak.toLowerCase() }),
    format(m.cert3, { block: r.blockNumber.toString(10) }),
    r.rpcs >= 2 ? format(m.cert4Many, { n: r.rpcs }) : m.cert4One,
    p9 ? format(m.cert5, { total, vectors: p9.vectors, seed: p9.seed.toString(10) }) : format(m.cert5NoP9, { total }),
    format(m.cert6, { seconds: formatCount(r.ms / 1000, lang, 1) }),
    format(m.cert7, { command: p9 ? verifyWithSeed(p9.seed) : COMMANDS.verify }),
    m.cert8,
  ];
}
