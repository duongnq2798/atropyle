import {
  DRILL_LIFETIME_SECONDS,
  modelEngine,
  type PlanIssue,
  PRESETS,
  planTemplate,
  STATE_CODES,
  validatePlan,
} from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { scenarios } from '../../src/flows/impl/time-machine';
import {
  DRILL_LIFETIME,
  firstWizardStep,
  issuesThrough,
  planEvalState,
  timingWindow,
  WIZARD_STEPS,
  wizardStepOfIssue,
} from '../../src/flows/impl/wizard';
import { PEOPLE } from './fixtures';

const issue = (path: string): PlanIssue => ({ path, code: 'REQUIRED', message: path });

describe('wizard steps', () => {
  it('sends every issue to the step that edits its field', () => {
    const cases = {
      heirs: 'heirs',
      'heirs[1].account': 'heirs',
      'heirs[0].bps': 'heirs',
      guardians: 'guardians',
      'guardians[2]': 'guardians',
      k: 'guardians',
      recoveryEnabled: 'guardians',
      timing: 'timing',
      'timing.window': 'timing',
      assets: 'assets',
      'assets[3].token': 'assets',
      version: 'assets',
      drill: 'assets',
      '': 'assets',
    } as const;
    for (const [path, step] of Object.entries(cases)) expect(wizardStepOfIssue(path), path).toBe(step);
  });

  it('blocks a step on its own issues and those of the steps before it', () => {
    const list = [issue('timing.period'), issue('heirs[0].account'), issue('assets[0].token')];
    expect(WIZARD_STEPS).toEqual(['kind', 'heirs', 'guardians', 'timing', 'assets', 'review', 'done']);
    expect(issuesThrough(list, 'kind')).toEqual([]);
    expect(issuesThrough(list, 'guardians').map((i) => i.path)).toEqual(['heirs[0].account']);
    expect(issuesThrough(list, 'review')).toHaveLength(3);
    expect(firstWizardStep(list)).toBe('heirs');
    expect(firstWizardStep([])).toBeNull();
  });

  it('builds the time machine state of a plan that is not on chain yet', () => {
    const input = planTemplate('guarded', {
      drill: true,
      heirs: [{ account: PEOPLE.heirA }],
      guardians: [PEOPLE.g1, PEOPLE.g2],
    });
    const r = validatePlan(input, { owner: PEOPLE.owner, drill: true });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const { state, expiresAt } = planEvalState(r.config, PEOPLE.owner, 1_000n);
    expect(state).toMatchObject({
      state: STATE_CODES.active,
      owner: PEOPLE.owner,
      lastAlive: 1_000n,
      alarmAt: 0n,
      timing: PRESETS.drill,
      k: 2,
      recoveryEnabled: true,
      inhVotes: 0,
      recoveryTarget: null,
    });
    expect(state.guardians).toEqual([PEOPLE.g1, PEOPLE.g2]);
    expect(state.guardians).not.toBe(r.config.guardians);
    expect(state.recVotes).toEqual([null, null]);
    expect(DRILL_LIFETIME).toBe(BigInt(DRILL_LIFETIME_SECONDS));
    expect(expiresAt).toBe(1_000n + BigInt(DRILL_LIFETIME_SECONDS));
    // T5: a guarded Drill with recovery offers all five scenarios.
    expect(scenarios(modelEngine(), state, 1_000n, expiresAt, true).map((s) => s.id)).toEqual([
      'silent',
      'confirm',
      'recover',
      'returns',
      'recoverBlocked',
    ]);
    const simple = validatePlan(planTemplate('simple', { drill: false, heirs: [{ account: PEOPLE.heirA }] }), {
      owner: PEOPLE.owner,
      drill: false,
    });
    if (!simple.ok) throw new Error(JSON.stringify(simple.issues));
    const paid = planEvalState(simple.config, PEOPLE.owner, 1_000n);
    expect(paid.expiresAt).toBeNull();
    expect(scenarios(modelEngine(), paid.state, 1_000n, null, false).map((s) => s.id)).toEqual(['silent']);
  });

  it('reads the alarm window of the timing step, or null while a custom one does not parse', () => {
    const blank = { period: '', threshold: '', window: '' };
    expect(timingWindow({ preset: 'drill', ...blank })).toBe(PRESETS.drill.window);
    expect(timingWindow({ preset: 'twelveMonths', ...blank })).toBe(PRESETS.twelveMonths.window);
    expect(timingWindow({ preset: 'custom', period: '1d', threshold: '2', window: '3d' })).toBe(3 * 86_400);
    expect(timingWindow({ preset: 'custom', ...blank, window: ' 2m ' })).toBe(120);
    for (const window of ['', 'soon', '0', '-5m']) {
      expect(timingWindow({ preset: 'custom', ...blank, window }), window).toBeNull();
    }
  });
});
