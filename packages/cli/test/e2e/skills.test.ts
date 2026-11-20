import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commandsOf, SKILL_NAMES, skillFiles } from '../skills-lib';
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

describe.each(SKILL_NAMES)('every command of %s runs on the devnet', (skill) => {
  // One working directory per skill, so `plan init` comes before `plan check`, as in the skill.
  const cwd = tmp();
  const commands = skillFiles(skill).flatMap((f) => commandsOf(readFileSync(f, 'utf8')));

  for (const command of commands) {
    it(command, async () => {
      const v = values();
      const args = command
        .replace(/^npx -y atropyle /, '')
        .split(/\s+/)
        .map((a) => a.replace(/<[A-Z0-9_]+>/g, (p) => v[p] ?? p));
      const r = await cli([...args, ...DEP()], { cwd });
      expect([2, 4], `${command}\nexit ${r.code}\n${r.stdout}\n${r.stderr}`).not.toContain(r.code);
      expectSchema(schemaOf(args), json(r));
    });
  }
});
