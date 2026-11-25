import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { argsOf, commandsOf, SKILL_NAMES, skillFiles } from '../skills-lib';
import { account, cli, DEP, devnet, expectSchema, json, tmp } from './helpers';

const values = (): Record<string, string> => ({
  '<OWNER>': account(1),
  '<HEIR_1>': account(2),
  '<HEIR_2>': account(5),
  '<GUARDIAN_1>': account(3),
  '<GUARDIAN_2>': account(4),
  '<NEW_WALLET>': account(6),
  '<VAULT>': devnet().vaults.guarded,
  '<GRACE_VAULT>': devnet().vaults.grace,
  '<TOKEN>': devnet().feeTokens[0],
  '<PLAN_FILE>': 'atropyle.plan.json',
});
const schemaOf = (args: string[]) => (args[0] === 'plan' ? `plan-${args[1]}` : args[0]);

/**
 * The exit code of every command of the skills on the devnet. A new command must declare its own,
 * so a command that starts to fail (an error envelope also matches the schema) turns this test red.
 * Every command exits 0 except `verify` (3): the devnet CPU is not the TapeOut processor, so the check fails.
 * Keys are the arguments, without the pinned `npx -y atropyle@<version>` prefix (argsOf).
 */
const EXPECTED: Record<string, Record<string, number>> = {
  'atropyle-estate-planning': {
    'doctor --json': 0,
    'plan init --heir <HEIR_1>:70 --heir <HEIR_2>:30 --guardian <GUARDIAN_1> --guardian <GUARDIAN_2> --k 2 --asset erc20:<TOKEN> --owner <OWNER> --drill --json': 0,
    'plan check <PLAN_FILE> --json': 0,
    'simulate --plan <PLAN_FILE> --json': 0,
    'prepare create-vault <PLAN_FILE> --json': 0,
    'vaults <OWNER> --json': 0,
    'status <VAULT> --as <OWNER> --json': 0,
    'verify --vault <VAULT> --json': 3, // the devnet factory's CPU is not the pinned TapeOut processor
    'prepare check-in <VAULT> --as <OWNER> --json': 0,
    'simulate <VAULT> poke --as <HEIR_1> --at +200d --json': 0,
  },
  'atropyle-guardian': {
    'vaults <GUARDIAN_1> --json': 0,
    'verify --vault <VAULT> --json': 3, // the devnet factory's CPU is not the pinned TapeOut processor
    'status <VAULT> --as <GUARDIAN_1> --json': 0,
    'simulate <VAULT> attest-death --as <GUARDIAN_1> --json': 0,
    'prepare attest-death <VAULT> --as <GUARDIAN_1> --json': 0,
    'prepare attest-death <VAULT> --off --as <GUARDIAN_1> --json': 0,
    'prepare vote-recovery <VAULT> --target <NEW_WALLET> --as <GUARDIAN_1> --json': 0,
    'prepare vote-recovery <VAULT> --withdraw --as <GUARDIAN_1> --json': 0,
    'status <GRACE_VAULT> --as <HEIR_1> --json': 0,
    'prepare poke <GRACE_VAULT> --as <HEIR_1> --json': 0,
    'prepare distribute <GRACE_VAULT> --as <HEIR_1> --json': 0,
  },
};

/** The heir steps of the guardian skill on the grace vault: nothing is due, so the output must say NO_EFFECT. */
const NO_EFFECT = [
  'prepare poke <GRACE_VAULT> --as <HEIR_1> --json',
  'prepare distribute <GRACE_VAULT> --as <HEIR_1> --json',
];

describe.each(SKILL_NAMES)('every command of %s runs on the devnet', (skill) => {
  // One working directory per skill, so `plan init` comes before `plan check`, as in the skill.
  const cwd = tmp();
  const commands = skillFiles(skill).flatMap((f) => commandsOf(readFileSync(f, 'utf8')));
  const expected = EXPECTED[skill] ?? {};

  it('declares an exit code for exactly these commands', () => {
    expect(Object.keys(expected).sort()).toEqual(commands.map(argsOf).sort());
  });

  for (const command of commands) {
    it(command, async () => {
      const v = values();
      const rest = argsOf(command);
      const args = rest.split(/\s+/).map((a) => a.replace(/<[A-Z0-9_]+>/g, (p) => v[p] ?? p));
      const r = await cli([...args, ...DEP()], { cwd });
      const out = json(r);
      expectSchema(schemaOf(args), out);
      expect(r.code, `${command}\n${r.stdout}\n${r.stderr}`).toBe(expected[rest]);
      if (NO_EFFECT.includes(rest)) {
        expect(
          out.warnings.map((w: { code: string }) => w.code),
          command,
        ).toContain('NO_EFFECT');
      }
      if (expected[rest] === 0 || expected[rest] === 3) expect(out.error, command).toBeUndefined();
    });
  }
});
