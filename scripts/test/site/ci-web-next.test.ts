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
const isNpmScript = (c: string): boolean => c.startsWith('npm run ') || c.startsWith('npm test');

/** Every command of the job, as Plan 7A Task 15 leaves it. */
const WEB_NEXT_COMMANDS = [
  'npm ci',
  'forge build',
  'npm run build',
  'npm run typecheck -w apps/web',
  'npm test -w apps/web',
  'npm run playwright:install -w apps/web',
  'npm run test:build -w apps/web',
  'npm run worker:check -w apps/web',
  'npm run e2e -w apps/web',
  'npm run build -w apps/web',
  'npm run size -w apps/web',
  'npm run lighthouse -w apps/web',
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

test('the web-next job installs Foundry 1.9.0 and builds the contracts before e2e', () => {
  const foundry = job.steps.find((s) => s.uses?.startsWith('foundry-rs/foundry-toolchain@'));
  expect(foundry?.with?.version).toBe('v1.9.0');
  expect(job.steps.find((s) => s.run === 'forge build')?.['working-directory']).toBe('contracts');
  const c = commands();
  expect(c.indexOf('forge build')).toBeLessThan(c.indexOf('npm run e2e -w apps/web'));
  expect(c.indexOf('npm run playwright:install -w apps/web')).toBeLessThan(c.indexOf('npm run e2e -w apps/web'));
});

test('size and Lighthouse read a fresh production build, made after every other build', () => {
  const c = commands();
  const build = c.indexOf('npm run build -w apps/web');
  for (const before of [
    'npm run test:build -w apps/web',
    'npm run worker:check -w apps/web',
    'npm run e2e -w apps/web',
  ]) {
    expect(c.indexOf(before), before).toBeLessThan(build);
  }
  expect(build).toBeLessThan(c.indexOf('npm run size -w apps/web'));
  expect(c.indexOf('npm run size -w apps/web')).toBeLessThan(c.indexOf('npm run lighthouse -w apps/web'));
});

test('the web-next job runs only npm scripts that exist', () => {
  const runs = commands().filter(isNpmScript);
  expect(runs.length).toBeGreaterThanOrEqual(WEB_NEXT_COMMANDS.filter(isNpmScript).length);
  for (const c of runs) {
    const m = /^npm (?:run ([\w:-]+)|(test))(?: -w (\S+))?/.exec(c);
    expect(m, c).not.toBeNull();
    const [, script, npmTest, workspace] = m as RegExpExecArray;
    expect(scriptsOf(workspace ?? '.'), c).toContain(script ?? npmTest);
  }
});
