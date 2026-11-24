'use client';

import Link from 'next/link';
import { POLICY_NETLIST_KECCAK } from '@/config/facts';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { LIMITS_HREF, ROUTES } from '@/routes';

/** `0x7016…3864`: the first four and the last four hex digits; the full hash is the link's title. */
const SHORT = `${POLICY_NETLIST_KECCAK.slice(0, 6)}…${POLICY_NETLIST_KECCAK.slice(-4)}`;
const LINK =
  'rounded-sm text-thread underline decoration-thread/40 underline-offset-2 transition-colors duration-150 hover:decoration-thread';

/**
 * Splits a template at `{keccak}` and `{limits}`, so both links sit inside one translated sentence. A template
 * without both, in that order, is a bug; test/unit/proof-line.test.tsx renders both languages, so it fails there.
 */
function around(template: string): [string, string, string] {
  const k = template.indexOf('{keccak}');
  const l = template.indexOf('{limits}');
  if (k < 0 || l < k) throw new Error(`the proof line needs {keccak} before {limits}: ${template}`);
  return [template.slice(0, k), template.slice(k + '{keccak}'.length, l), template.slice(l + '{limits}'.length)];
}

function Variant({ variant, template, limits }: { variant: 'wide' | 'narrow'; template: string; limits: string }) {
  const [before, between, after] = around(template);
  return (
    <span data-variant={variant} className={variant === 'wide' ? 'hidden md:inline' : 'md:hidden'}>
      {before}
      {/* prefetch stays off until /proof/ exists (Quyết định 22; 7C T3 turns it on). */}
      <Link href={ROUTES.proof} prefetch={false} title={POLICY_NETLIST_KECCAK} className={LINK}>
        {SHORT}
      </Link>
      {between}
      <Link href={LIMITS_HREF} prefetch={false} className={LINK}>
        {limits}
      </Link>
      {after}
    </span>
  );
}

/**
 * The first line every page shows (R18.7): where the guarantee lives (the netlist frozen on X Layer) and where it
 * stops (unaudited, the known limits). Prerendered, one 24 px line, never dismissable. Both variants are in the
 * HTML and CSS picks one, so nothing measures the width in JS.
 */
export function ProofLine() {
  const t = useT(shell);
  return (
    <p
      data-testid="proof-line"
      className="h-6 whitespace-nowrap border-line/60 border-b bg-surface-1 px-4 text-center font-mono text-caption text-ink-muted leading-6"
    >
      <Variant variant="wide" template={t('proofLine')} limits={t('proofLimits')} />
      <Variant variant="narrow" template={t('proofLineShort')} limits={t('proofLimitsShort')} />
    </p>
  );
}
