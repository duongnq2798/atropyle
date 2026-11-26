'use client';

import type { PlanIssue } from '@atropyle/sdk';
import { Plus, X } from 'lucide-react';
import type { HeirRow } from '@/flows/impl/create-form';
import type { FlowsImpl } from '@/flows/load';
import { evenSplit, sharesOf, withShares } from '@/flows/shares';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/editors.messages';
import { BRANCH_BG } from '@/thread/branches';
import { Button } from '@/ui/button';
import { InlineError } from '@/ui/inline-error';
import { PlainIconButton } from '@/ui/plain-icon-button';
import { AddressInput } from './address-input';
import { useIssueText } from './issue-list';
import { ShareSplitter } from './share-splitter';

export interface HeirsEditorProps {
  flows: FlowsImpl;
  rows: readonly HeirRow[];
  issues: readonly PlanIssue[];
  /** Plan check sentences show only after the user tried to move on. */
  showIssues: boolean;
  testId: string;
  onChange(rows: HeirRow[]): void;
  /** The page removes the row and moves that heir's NFTs (removeHeir), then splits the shares evenly again. */
  onRemove(index: number): void;
  /** The page's own heading names the step (the wizard): the legend stays for screen readers only. */
  hideLegend?: boolean;
}

/** An issue of the shares: the list itself, or one heir's bps or percent. */
const SHARE_PATH = /^heirs(?:\[\d+\]\.(?:bps|percent))?$/;

export function HeirsEditor({
  flows,
  rows,
  issues,
  showIssues,
  testId,
  onChange,
  onRemove,
  hideLegend,
}: HeirsEditorProps) {
  const t = useT(messages);
  const issueText = useIssueText(flows);
  const first = (match: (path: string) => boolean): string | undefined => {
    const hit = showIssues ? issues.find((i) => match(i.path)) : undefined;
    return hit ? issueText(hit) : undefined;
  };
  const dupes = new Set(flows.duplicateIndexes(rows.map((r) => r.account)));
  const names = rows.map((_, i) => t('heirName', { n: i + 1 }));
  const shares = sharesOf(rows);
  const sharesError = first((p) => SHARE_PATH.test(p));
  const setAccount = (i: number, account: string) => onChange(rows.map((r, j) => (j === i ? { ...r, account } : r)));
  return (
    <fieldset className="space-y-4">
      <legend className={hideLegend ? 'sr-only' : 'font-display text-h2 text-ink'}>{t('heirsTitle')}</legend>
      <p className="text-body text-ink-muted">{t('heirsHelp', { max: flows.LIMITS.maxHeirs })}</p>
      {rows.map((r, i) => (
        <AddressInput
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional (heir 1, heir 2); an index key keeps focus while typing
          key={i}
          flows={flows}
          label={
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn('size-2.5 shrink-0 rounded-full', BRANCH_BG[i % BRANCH_BG.length])}
              />
              {t('heirAccount', { n: i + 1 })}
            </span>
          }
          value={r.account}
          testId={`${testId}-heir-${i}-account`}
          duplicate={dupes.has(i)}
          error={first((p) => p === `heirs[${i}].account` || p === `heirs[${i}]`)}
          onChange={(v) => setAccount(i, v)}
          action={
            rows.length > 1 ? (
              <PlainIconButton
                icon={X}
                label={t('removeHeir', { n: i + 1 })}
                data-testid={`${testId}-remove-heir-${i}`}
                onClick={() => onRemove(i)}
              />
            ) : null
          }
        />
      ))}
      {rows.length < flows.LIMITS.maxHeirs ? (
        <Button
          variant="secondary"
          icon={<Plus aria-hidden="true" className="size-4" />}
          data-testid={`${testId}-add-heir`}
          onClick={() => {
            const next = [...rows, { account: '', percent: '' }];
            onChange(withShares(next, evenSplit(next.length)));
          }}
        >
          {t('addHeir')}
        </Button>
      ) : null}
      <div className="space-y-2">
        {rows.length > 1 ? <h3 className="text-lead text-ink">{t('sharesTitle')}</h3> : null}
        <ShareSplitter
          shares={shares}
          names={names}
          testId={`${testId}-shares`}
          onChange={(s) => onChange(withShares(rows, s))}
        />
        {sharesError ? <InlineError>{sharesError}</InlineError> : null}
      </div>
    </fieldset>
  );
}
