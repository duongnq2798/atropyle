// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { issueField } from '../../src/flows/editors/issue-field';
import { messages } from '../../src/messages/editors.messages';

describe('issueField', () => {
  it('names the field of every path the plan check writes, with its row counted from 1', () => {
    const cases: [string, ReturnType<typeof issueField>][] = [
      ['', { key: 'fieldPlan' }],
      ['version', { key: 'fieldPlan' }],
      ['drill', { key: 'fieldPlan' }],
      ['owner', { key: 'fieldPlan' }],
      ['heirs', { key: 'fieldHeirs' }],
      ['heirs[1]', { key: 'heirAccount', n: 2 }],
      ['heirs[1].account', { key: 'heirAccount', n: 2 }],
      ['heirs[0].bps', { key: 'fieldHeirShare', n: 1 }],
      ['heirs[4].percent', { key: 'fieldHeirShare', n: 5 }],
      ['guardians', { key: 'guardiansTitle' }],
      ['guardians[2]', { key: 'guardianAccount', n: 3 }],
      ['k', { key: 'kLabel' }],
      ['recoveryEnabled', { key: 'fieldRecovery' }],
      ['timing', { key: 'fieldTiming' }],
      ['timing.period', { key: 'periodLabel' }],
      ['timing.threshold', { key: 'thresholdLabel' }],
      ['timing.window', { key: 'windowLabel' }],
      ['timing.constructor', { key: 'fieldTiming' }],
      ['assets', { key: 'fieldAssets' }],
      ['assets[0]', { key: 'fieldAsset', n: 1 }],
      ['assets[3].token', { key: 'fieldAsset', n: 4 }],
      ['heirs[0].account.x', { key: 'fieldPlan' }],
    ];
    for (const [path, want] of cases) expect(issueField(path), path).toEqual(want);
  });

  it('only names keys that editors.messages has', () => {
    for (const path of ['', 'heirs', 'heirs[0]', 'heirs[0].bps', 'guardians', 'guardians[0]', 'k', 'recoveryEnabled'])
      expect(Object.keys(messages.en)).toContain(issueField(path).key);
  });
});
