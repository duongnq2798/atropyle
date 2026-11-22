import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'working-directory'?: string;
}
interface Job {
  permissions?: Record<string, string>;
  steps: Step[];
}

const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> };
const job = workflow.jobs['web-next'] as Job;
const commands = (): string[] =>
  (job?.steps ?? [])
    .flatMap((s) => (s.run ?? '').split(/&&|\n/))
    .map((c) => c.trim())
    .filter((c) => c !== '');
const scriptsOf = (dir: string): string[] =>
  Object.keys(
    (JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {},
  );

/** Grows with Plan 7A: Task 15 adds the e2e, size and Lighthouse steps. */
const WEB_NEXT_COMMANDS = [
  'npm ci',
  'npm run build',
  'npm run typecheck -w apps/web',
  'npm test -w apps/web',
  'npm run playwright:install -w apps/web',
  'npm run test:build -w apps/web',
  'npm run worker:check -w apps/web',
];

test('the web-next job reads only, holds no secret and signs nothing', () => {
  expect(job).toBeDefined();
  expect(job.permissions).toEqual({ contents: 'read' });
  expect(JSON.stringify(job)).not.toMatch(
    /secrets\.|PRIVATE_KEY|DEWEB_OPERATOR_KEY|KEEPER_KEY|SUPABASE_ACCESS_TOKEN|VERCEL_TOKEN|--broadcast|cast send|deweb:publish|eth_sendRawTransaction/,
  );
});

test('the web-next job checks out without keeping credentials and pins every action', () => {
  const checkout = job.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  expect(checkout?.with?.['persist-credentials']).toBe(false);
  for (const s of job.steps) if (s.uses) expect(s.uses, s.uses).toMatch(/@v\d+$/);
  expect(commands().some((c) => c.startsWith('npx'))).toBe(false);
});

test('the web-next job builds the SDK first, then tests, then builds both targets', () => {
  const c = commands();
  for (const want of WEB_NEXT_COMMANDS) expect(c, want).toContain(want);
  expect(c.indexOf('npm run build')).toBeLessThan(c.indexOf('npm test -w apps/web'));
  expect(c.indexOf('npm run playwright:install -w apps/web')).toBeLessThan(
    c.indexOf('npm run worker:check -w apps/web'),
  );
});

test('the web-next job runs only npm scripts that exist', () => {
  const runs = commands().filter((c) => c.startsWith('npm run ') || c.startsWith('npm test'));
  expect(runs.length).toBeGreaterThanOrEqual(WEB_NEXT_COMMANDS.length - 1);
  for (const c of runs) {
    const m = /^npm (?:run ([\w:-]+)|(test))(?: -w (\S+))?/.exec(c);
    expect(m, c).not.toBeNull();
    const [, script, npmTest, workspace] = m as RegExpExecArray;
    expect(scriptsOf(workspace ?? '.'), c).toContain(script ?? npmTest);
  }
});
