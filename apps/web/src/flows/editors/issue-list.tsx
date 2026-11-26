'use client';

import type { PlanIssue } from '@atropyle/sdk';
import type { FlowsImpl } from '@/flows/load';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { messages as editors } from '@/messages/editors.messages';
import { messages } from '@/messages/issues.messages';
import { issueField } from './issue-field';

export function issuesAt(issues: readonly PlanIssue[], path: string): PlanIssue[] {
  return issues.filter((i) => i.path === path);
}

/**
 * The plain sentence for an issue in the page's language, its numbers from the SDK's LIMITS (principle 3). `drill`
 * changes only the two timing minimums, so only the timing step and IssueList pass it.
 */
export function useIssueText(flows: FlowsImpl, drill = false): (issue: PlanIssue) => string {
  const t = useT(messages);
  const { lang } = useLang();
  const L = flows.LIMITS;
  const params = {
    maxHeirs: L.maxHeirs,
    maxGuardians: L.maxGuardians,
    maxAssets: L.maxAssets,
    maxThreshold: L.maxThreshold,
    minPeriod: durationWords(drill ? L.drillMin : L.minPeriod, lang),
    minWindow: durationWords(drill ? L.drillMin : L.minWindow, lang),
  };
  return (issue) => t(issue.code, params);
}

/** The field a plan check path names, in the page's language ("Heir 2 wallet"). */
export function useFieldText(): (path: string) => string {
  const t = useT(editors);
  return (path) => {
    const f = issueField(path);
    return t(f.key, f.n === undefined ? undefined : { n: f.n });
  };
}

export interface IssueListProps {
  flows: FlowsImpl;
  drill: boolean;
  issues: readonly PlanIssue[];
  testId: string;
  className?: string;
}

/**
 * Every issue of a step, above its fields, as "<field>: <what is wrong>" in the reader's language. The alert region
 * is in the page from the first paint and empty until there is something to say (7A rule 19), so the first list is
 * read out; a page that waits for the user to move on passes no issues until then.
 */
export function IssueList({ flows, drill, issues, testId, className }: IssueListProps) {
  const t = useT(editors);
  const text = useIssueText(flows, drill);
  const field = useFieldText();
  const some = issues.length > 0;
  return (
    <div
      role="alert"
      data-testid={testId}
      data-count={issues.length}
      className={
        some ? cn('space-y-2 rounded-xl border border-danger bg-surface-1 p-4 text-small', className) : undefined
      }
    >
      {some ? (
        <>
          <p className="font-medium text-ink">{t('issuesTitle')}</p>
          <ul className="space-y-1.5 text-ink">
            {issues.map((i) => (
              <li key={`${i.path}|${i.code}`} data-path={i.path} data-code={i.code}>
                {t('issueLine', { field: field(i.path), issue: text(i) })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
