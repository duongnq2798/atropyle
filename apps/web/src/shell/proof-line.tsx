'use client';

import { ArrowRight } from 'lucide-react';
import { POLICY_NETLIST_KECCAK } from '@/config/facts';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { LIMITS_HREF, ROUTES } from '@/routes';
import { NavLink } from './nav-link';

/** `0x7016…3864`: the first four and the last four hex digits; the full hash is the link's title. */
const SHORT = `${POLICY_NETLIST_KECCAK.slice(0, 6)}…${POLICY_NETLIST_KECCAK.slice(-4)}`;
const LINK = 'rounded-sm underline underline-offset-2 transition-colors duration-150';
const GOLD = `${LINK} text-thread decoration-thread/40 hover:decoration-thread`;
/** "unaudited" and its arrow on a phone: R21 keeps the word in the line's own muted ink, with no accent. */
const MUTED = `${LINK} text-ink-muted decoration-line-strong hover:text-ink`;
/**
 * The arrow after "limits" is an icon, not the character `→`: no self-hosted subset has U+2192, so the browser would
 * draw it in a foreign system font (plan rule 20; test/unit/glyphs.test.ts keeps every message inside the fonts). A
 * 1em box plus half a space, about the two characters that ` →` took in the mono line; a 2 px stroke in the 24 px
 * viewBox is 1 px at 12 px, as heavy as the mono stems.
 */
const ARROW = 'ml-[0.5ch] inline-block size-[1em] align-[-0.125em]';

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
      {/* Prefetched (spec §18 rule 12, 7C T3): /proof/ is one tap from every page. A Windows build needs the postbuild
          step of scripts/lib/segments.ts for that, or the prefetch file of /proof/ lands in a folder and every
          prefetch logs a 404. NavLink, like the footer's "Known limits": a plain next/link would leave without the
          route's view transition (Task 15, outcome B). */}
      <NavLink href={ROUTES.proof} title={POLICY_NETLIST_KECCAK} className={GOLD}>
        {SHORT}
      </NavLink>
      {between}
      <NavLink href={LIMITS_HREF} className={variant === 'wide' ? GOLD : MUTED}>
        {limits}
        <ArrowRight aria-hidden="true" strokeWidth={2} className={ARROW} />
      </NavLink>
      {after}
    </span>
  );
}

/**
 * The first line every page shows (R18.7): where the guarantee lives (the netlist frozen on X Layer) and where it
 * stops (unaudited, the known limits). Prerendered, one 24 px line, never dismissable. Both variants are in the
 * HTML and CSS picks one, so nothing measures the width in JS. A labelled landmark of its own, outside the sticky
 * header, since the line scrolls away. Below 20rem the gutters narrow; a screen narrower than the line (a fold
 * cover, a zoomed phone) clips its end instead of scrolling the page sideways, 4 px out so a focus ring still shows.
 */
export function ProofLine() {
  const t = useT(shell);
  return (
    <aside aria-label={t('proofLineLabel')}>
      <p
        data-testid="proof-line"
        className="h-6 overflow-clip whitespace-nowrap border-line/60 border-b bg-surface-1 px-4 text-center font-mono text-caption text-ink-muted leading-6 [overflow-clip-margin:4px] max-[20rem]:px-2"
      >
        <Variant variant="wide" template={t('proofLine')} limits={t('proofLimits')} />
        <Variant variant="narrow" template={t('proofLineShort')} limits={t('proofLimitsShort')} />
      </p>
    </aside>
  );
}
