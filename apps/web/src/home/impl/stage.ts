import { buildAll } from '@atropyle/circuits';
import { type EvalState, type PolicyEngine, programEngine } from '@atropyle/sdk';
import type { TimeMachineImpl } from '@/flows/time-machine/load';
import { HOME_OPTIONS, HOME_PEOPLE, HOME_VAULT, LATE_OPTIONS, type StageRun, type StageRuns } from '../sim-days';
import { HERO_BASE } from './hero-states';

let engine: PolicyEngine | null = null;

/** The repository's policy circuit, compiled once (Decision 8): only the stage's lazy chunk reaches it. */
export function stageEngine(): PolicyEngine {
  engine ??= programEngine(buildAll().program);
  return engine;
}

/** The hero's vault with recovery at k = 2 of 3 guardians (spec §18.4.3 Task 6). */
export const RECOVER_BASE: EvalState = {
  ...HERO_BASE,
  k: HOME_VAULT.recover.k,
  guardians: [HOME_PEOPLE.g1, HOME_PEOPLE.g2, HOME_PEOPLE.g3],
  recVotes: [null, null, null],
};

function pick(runs: readonly StageRun[], id: StageRun['id']): StageRun {
  const run = runs.find((r) => r.id === id);
  if (!run) throw new Error(`scenarios() offered no ${id} story`);
  return run;
}

/**
 * The six stories of the stage, computed now by scenarios() (passed in: no file of src/home imports the time
 * machine's logic, R18.14) on the netlist, or on `e`. STAGE_RUNS prerenders the same (sim.test.ts).
 */
export function homeRuns(scenarios: TimeMachineImpl['scenarios'], e: PolicyEngine = stageEngine()): StageRuns {
  const inherit = scenarios(e, HERO_BASE, 0n, null, false, HOME_OPTIONS);
  const late = scenarios(e, HERO_BASE, 0n, null, false, LATE_OPTIONS);
  const recover = scenarios(e, RECOVER_BASE, 0n, null, false, HOME_OPTIONS);
  return {
    silent: pick(inherit, 'silent'),
    confirm: pick(inherit, 'confirm'),
    confirmBack: pick(inherit, 'returns'),
    back: pick(late, 'returns'),
    recover: pick(recover, 'recover'),
    recoverBack: pick(recover, 'recoverBlocked'),
  };
}
