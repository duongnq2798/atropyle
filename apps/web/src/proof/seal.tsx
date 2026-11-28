'use client';

import type { CodeCheck } from '@atropyle/sdk';
import { Check, EqualNot, Minus, X } from 'lucide-react';
import { ENV, explorerUrlOf } from '@/config/env';
import { POLICY_NETLIST_KECCAK } from '@/config/facts';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { messages } from '@/messages/proof.messages';
import { Address } from '@/ui/address';
import type { PolicyVerification } from '@/verify/types';

const HEX64 = /^0x[0-9a-fA-F]{64}$/;
const GROUP_DIGITS = 4;

/** A 32-byte hash (64 hex digits) in groups of four: the seal's columns, and the {groups} of its words. */
export const HASH_GROUPS = 64 / GROUP_DIGITS;

/** A 32-byte hash as HASH_GROUPS groups of four lower-case hex digits; null for anything of another shape. */
export function hashGroups(hash: string | null | undefined): string[] | null {
  if (!hash || !HEX64.test(hash)) return null;
  const body = hash.slice(2).toLowerCase();
  return Array.from({ length: HASH_GROUPS }, (_, i) => body.slice(i * GROUP_DIGITS, (i + 1) * GROUP_DIGITS));
}

/** The top row: the keccak that facts.test.ts ties to the deployment record and to the netlist this source builds. */
const CELLS = (hashGroups(POLICY_NETLIST_KECCAK) ?? []).map((group, at) => ({ group, at }));
/** A group not read yet: four middle dots, a character of every self-hosted subset. */
const UNREAD = '\u00b7\u00b7\u00b7\u00b7';

type Sign = 'pending' | 'equal' | 'differs';

function SignMark({ sign }: { sign: Sign }) {
  if (sign === 'differs') return <EqualNot data-sign="differs" size={14} strokeWidth={2} className="text-danger" />;
  return (
    <span data-sign={sign} className={cn('leading-none', sign === 'equal' ? 'text-alive' : 'text-ink-muted')}>
      {sign === 'equal' ? '=' : '\u00b7'}
    </span>
  );
}

/** A hash in groups of four, written as Address writes an address (0x7016 7214 \u2026), so the two read alike. */
function HashText({ hash }: { hash: string | null }) {
  const groups = hashGroups(hash);
  return (
    <code translate="no" className="font-mono text-small tabular-nums wrap-anywhere">
      {groups ? `0x${groups.join(' ')}` : '\u2014'}
    </code>
  );
}

function Status({ ok, yes, no, unknown }: { ok: boolean | null; yes: string; no: string; unknown?: string }) {
  const Icon = ok === true ? Check : ok === false ? X : Minus;
  return (
    <p className={cn('flex items-center gap-1.5 text-small', ok === false ? 'text-danger' : 'text-ink-muted')}>
      <Icon aria-hidden="true" size={14} strokeWidth={2} className={ok === true ? 'text-alive' : undefined} />
      {ok === true ? yes : ok === false ? no : unknown}
    </p>
  );
}

function CodeHashes({ code, explorer }: { code: CodeCheck; explorer: string | null }) {
  const t = useT(messages);
  return (
    <div data-testid="proof-code" data-pinned={String(code.matches)} className="flex flex-col gap-3">
      <h3 className="font-display text-title">{t('codeTitle')}</h3>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-1 p-4 sm:p-5">
        <dl className="grid items-baseline gap-x-8 gap-y-1 text-small sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-3">
          <dt className="text-ink-muted">{t('codeProxy')}</dt>
          <dd className="mb-2 min-w-0 sm:mb-0">
            <HashText hash={code.proxyCodehash} />
          </dd>
          <dt className="text-ink-muted">{t('codeImpl')}</dt>
          <dd className="mb-2 min-w-0 sm:mb-0">
            <Address address={code.implementation} explorer={explorer} size="sm" avatar={false} />
          </dd>
          <dt className="text-ink-muted">{t('codeImplHash')}</dt>
          <dd className="min-w-0">
            <HashText hash={code.implementationCodehash} />
          </dd>
        </dl>
        <Status ok={code.matches} yes={t('codePinned')} no={t('codeDiffers')} unknown={t('codeNoPin')} />
      </div>
    </div>
  );
}

/**
 * Spec §18.4.3 (Task 3): the policy netlist's keccak as two static rows of 16 groups of four, the source on top and
 * the chain below, an equals sign between each pair; then the processor's code hashes against the SDK's pins and every
 * netlist the policy calls. The top row is on the first paint (also without JavaScript); the bottom row comes with a
 * result. Nothing moves. The grid is a picture for the eye (aria-hidden); a screen reader hears both hashes in full.
 */
export function Seal({ result }: { result: PolicyVerification | undefined }) {
  const t = useT(messages);
  const { lang } = useLang();
  const explorer = explorerUrlOf(ENV);
  const policy = result?.netlists.find((n) => n.role === 'policy');
  const chain = result ? hashGroups(policy?.keccak) : null;
  const signs: Sign[] = CELLS.map((c) => (!result ? 'pending' : chain?.[c.at] === c.group ? 'equal' : 'differs'));
  const match: Sign = !result ? 'pending' : signs.every((s) => s === 'equal') ? 'equal' : 'differs';
  const summary =
    match === 'pending'
      ? t('sealPending')
      : match === 'equal'
        ? t('sealEqual', { groups: HASH_GROUPS })
        : t('sealDiffers', { n: signs.filter((s) => s !== 'equal').length, groups: HASH_GROUPS });
  const chainLabel = result ? t('sealChain', { block: result.blockNumber.toString(10) }) : t('sealChainPending');
  return (
    <section
      data-testid="proof-seal"
      data-match={match}
      aria-labelledby="proof-seal-title"
      className="flex flex-col gap-6"
    >
      <header className="flex max-w-3xl flex-col gap-2">
        <h2 id="proof-seal-title" className="font-display text-h2">
          {t('sealTitle')}
        </h2>
        <p className="text-ink-muted">{t('sealBody', { groups: HASH_GROUPS })}</p>
      </header>
      <figure
        className={cn(
          'flex flex-col gap-4 rounded-2xl border bg-surface-1 p-4 transition-colors duration-300 sm:p-6',
          match === 'equal' ? 'border-alive/45' : match === 'differs' ? 'border-danger/60' : 'border-line',
        )}
      >
        <div className="flex flex-col gap-1 text-ink-muted text-small sm:flex-row sm:gap-8">
          <p>{t('sealSource')}</p>
          <p>{chainLabel}</p>
        </div>
        <div
          aria-hidden="true"
          className="grid grid-cols-4 gap-2 font-mono text-small tabular-nums sm:grid-cols-8 xl:grid-cols-16"
        >
          {CELLS.map((c) => (
            <div
              key={c.at}
              data-group={c.at}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg px-1 py-2 transition-colors duration-300',
                signs[c.at] === 'equal' ? 'bg-alive/10' : signs[c.at] === 'differs' ? 'bg-danger/15' : 'bg-surface-2',
              )}
            >
              <span data-row="source" className="text-ink">
                {c.group}
              </span>
              <SignMark sign={signs[c.at]} />
              <span
                data-row="chain"
                className={!chain ? 'text-ink-muted' : signs[c.at] === 'equal' ? 'text-ink' : 'text-danger'}
              >
                {chain ? chain[c.at] : UNREAD}
              </span>
            </div>
          ))}
        </div>
        <p data-testid="proof-seal-words" className="sr-only">
          {`${t('sealSource')}: ${POLICY_NETLIST_KECCAK}. ${chainLabel}${chain ? `: 0x${chain.join('')}` : ''}.`}
        </p>
        <figcaption
          className={cn(
            'flex items-center gap-2 text-small',
            match === 'equal'
              ? 'font-medium text-alive'
              : match === 'differs'
                ? 'font-medium text-danger'
                : 'text-ink-muted',
          )}
        >
          {match === 'equal' ? <Check aria-hidden="true" size={16} strokeWidth={2.25} className="shrink-0" /> : null}
          {match === 'differs' ? (
            <EqualNot aria-hidden="true" size={16} strokeWidth={2.25} className="shrink-0" />
          ) : null}
          {summary}
        </figcaption>
      </figure>
      {result?.cpuCheck ? <CodeHashes code={result.cpuCheck.code} explorer={explorer} /> : null}
      {result ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-title">{t('netlistsTitle')}</h3>
          <ul className="grid gap-3 md:grid-cols-3">
            {result.netlists.map((n) => (
              <li
                key={n.id.toString(10)}
                data-testid="proof-netlist"
                data-role={n.role}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4"
              >
                <p className="flex items-baseline justify-between gap-2 text-small">
                  <span className="font-mono">{n.role}</span>
                  <span className="text-ink-muted tabular-nums">
                    {t('netlistMeta', { id: n.id.toString(10), gates: formatCount(n.gates, lang) })}
                  </span>
                </p>
                <HashText hash={n.keccak} />
                <Status ok={n.matchesSource} yes={t('matchesSource')} no={t('differsSource')} />
                <Status
                  ok={n.matchesDeployment}
                  yes={t('matchesDeploy')}
                  no={t('differsDeploy')}
                  unknown={t('noDeploy')}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
