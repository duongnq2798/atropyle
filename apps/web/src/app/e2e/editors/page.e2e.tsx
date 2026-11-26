'use client';

import { type ReactNode, useState } from 'react';
import type { Address } from 'viem';
import { type GuardianFields, GuardiansEditor } from '@/flows/editors/guardians-editor';
import { HeirsEditor } from '@/flows/editors/heirs-editor';
import { IssueList } from '@/flows/editors/issue-list';
import { ShareSplitter } from '@/flows/editors/share-splitter';
import { TimingEditor } from '@/flows/editors/timing-editor';
import * as flows from '@/flows/impl';
import type { CreateForm, HeirRow, TimingForm } from '@/flows/impl/create-form';
import { evenSplit, withShares } from '@/flows/shares';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/editors.messages';

/**
 * The plan editors on one page, for axe, the keyboard path and the review screenshots (test/e2e/editors.spec.ts).
 * The issues come from the real plan check (validatePlan) of a guarded Drill with three mistakes in it: a heir
 * written twice, a guardian with a broken checksum, check-ins under a minute apart. A reload starts over.
 */
const OWNER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const HEIRS: HeirRow[] = [
  { account: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', percent: '50' },
  { account: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc', percent: '30' },
  { account: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', percent: '20' },
];
const GUARDIANS: GuardianFields = {
  guardians: [
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    // 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 with its first letter capitalised: the checksum breaks.
    '0x14Dc79964da2c08b23698b3d3cc7ca32193d9955',
  ],
  k: '2',
  recoveryEnabled: true,
};
const TIMING: TimingForm = { preset: 'custom', period: '30s', threshold: '2', window: '2m' };

function Item({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-preview={id} className="flex min-w-0 flex-col gap-4">
      <h2 className="font-mono text-caption text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function EditorsPreview() {
  const t = useT(messages);
  const [rows, setRows] = useState<HeirRow[]>(HEIRS);
  const [guardians, setGuardians] = useState<GuardianFields>(GUARDIANS);
  const [timing, setTiming] = useState<TimingForm>(TIMING);
  const [show, setShow] = useState(true);
  const [five, setFive] = useState(() => evenSplit(flows.LIMITS.maxHeirs));
  const form: CreateForm = {
    drill: true,
    template: 'guarded',
    heirs: rows,
    guardians: guardians.guardians,
    k: guardians.k,
    recoveryEnabled: guardians.recoveryEnabled,
    timing,
    assets: [],
  };
  const check = flows.validatePlan(flows.formToPlan(form), { owner: OWNER, drill: true });
  const issues = check.ok ? [] : check.issues;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
      <h1 className="font-display text-ink text-title">Editors</h1>
      <label className="flex min-h-11 items-center gap-3 text-body text-ink">
        <input
          type="checkbox"
          data-testid="preview-show-issues"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          className="size-5 accent-thread"
        />
        Show the plan check
      </label>
      <IssueList flows={flows} drill issues={show ? issues : []} testId="preview-issues" />
      <Item id="heirs" title="three heirs · one written twice">
        <HeirsEditor
          flows={flows}
          rows={rows}
          issues={issues}
          showIssues={show}
          testId="preview"
          onChange={setRows}
          onRemove={(i) =>
            setRows((x) =>
              withShares(
                x.filter((_, j) => j !== i),
                evenSplit(x.length - 1),
              ),
            )
          }
        />
      </Item>
      <Item id="guardians" title="three guardians · a broken checksum · recovery on">
        <GuardiansEditor
          flows={flows}
          value={guardians}
          issues={issues}
          showIssues={show}
          testId="preview"
          recoveryWindow={flows.timingWindow(timing)}
          onChange={setGuardians}
        />
      </Item>
      <Item id="timing" title="Drill · custom · check-ins too close">
        <TimingEditor
          flows={flows}
          value={timing}
          drill
          issues={issues}
          showIssues={show}
          testId="preview"
          onChange={setTiming}
        />
      </Item>
      <Item id="five" title="five heirs · the five branch colours">
        <ShareSplitter
          shares={five}
          names={five.map((_, i) => t('heirName', { n: i + 1 }))}
          testId="five"
          onChange={setFive}
        />
      </Item>
    </div>
  );
}
