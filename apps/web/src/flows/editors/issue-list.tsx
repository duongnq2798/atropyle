'use client';

import type { PlanIssue } from '@atropyle/sdk';
import { CircleExclamationPoint } from 'lucide-react';
import { Fragment } from 'react';
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
  // issueLine with its placeholders left in, split around them: each language orders the field and the issue, and
  // the field is set in medium weight.
  const shape = t('issueLine').split(/(\{field\}|\{issue\})/);
  return (
    <div
      role="alert"
      data-testid={testId}
      data-count={issues.length}
      className={some ? cn('rounded-xl border border-danger bg-surface-1 p-4 text-small', className) : undefined}
    >
      {some ? (
        <>
          <p className="flex items-start gap-2 font-medium text-ink">
            <CircleExclamationPoint aria-hidden="true" size={18} strokeWidth={1.5} className="shrink-0 text-danger" />
            <span>{t('issuesTitle')}</span>
          </p>
          {/* The bullets hang in the padding, under the icon: every line starts where the title does. */}
          <ul className="mt-2 list-disc space-y-1.5 pl-[1.625rem] text-ink marker:text-danger">
            {issues.map((i) => (
              <li key={`${i.path}|${i.code}`} data-path={i.path} data-code={i.code}>
                {shape.map((s, j) =>
                  s === '{field}' ? (
                    <span key="field" className="font-medium">
                      {field(i.path)}
                    </span>
                  ) : s === '{issue}' ? (
                    <Fragment key="issue">{text(i)}</Fragment>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the template's own text, fixed for the language
                    <Fragment key={j}>{s}</Fragment>
                  ),
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
