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
}
interface Job {
  permissions?: Record<string, string>;
  steps: Step[];
}

const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> };
const job = workflow.jobs.web as Job;
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

test('the web job reads only, holds no secret and signs nothing', () => {
  expect(job).toBeDefined();
  expect(job.permissions).toEqual({ contents: 'read' });
  // The parsed job has no comments, so this checks commands, env and inputs only. test:site itself runs deweb-publish
  // and a local forge script against its own anvil with an unlocked account; the job never calls them directly.
  expect(JSON.stringify(job)).not.toMatch(
    /secrets\.|PRIVATE_KEY|DEWEB_OPERATOR_KEY|KEEPER_KEY|--broadcast|cast send|deweb:publish|eth_sendRawTransaction/,
  );
});

test('the web job checks out submodules without keeping credentials, and pins Foundry and the browser install', () => {
  const checkout = job.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  expect(checkout?.with?.submodules).toBe(true);
  expect(checkout?.with?.['persist-credentials']).toBe(false);
  expect(commands()).toContain('npm run playwright:install -w apps/web-legacy');
  expect(commands().some((c) => c.startsWith('npx'))).toBe(false);
  const foundry = job.steps.find((s) => s.uses?.startsWith('foundry-rs/foundry-toolchain'));
  expect(foundry?.with?.version).toBe('v1.9.0');
  const order = job.steps.map((s) => s.uses?.split('@')[0] ?? s.run ?? '');
  expect(order.indexOf('foundry-rs/foundry-toolchain')).toBeLessThan(order.indexOf('npm run test:site'));
  expect(order.indexOf('forge build')).toBeLessThan(order.indexOf('npm run test:site'));
  for (const s of job.steps) if (s.uses) expect(s.uses, s.uses).toMatch(/@v\d+$/);
});

test('the web job runs the unit, script and e2e tests, both site checks and the size budget', () => {
  const c = commands();
  for (const want of [
    'npm ci',
    'npm run build',
    'npm run typecheck -w apps/web-legacy',
    'npm test -w apps/web-legacy',
    'npm run test:site',
    'npm run e2e -w apps/web-legacy',
    'npm run site:build -- --target deweb --no-docs',
    'npm run site:check -- --target deweb',
    'npm run site:build -- --target pages --no-docs',
    'npm run site:check -- --target pages',
    'npm run size -w apps/web-legacy',
  ]) {
    expect(c, want).toContain(want);
  }
  expect(c.indexOf('npm run build')).toBeLessThan(c.indexOf('npm test -w apps/web-legacy'));
  const deweb = job.steps.find((s) => s.run?.includes('--target deweb'));
  expect(deweb?.env?.VITE_WORKER_URL).toBe('https://health.atropyle.invalid');
});

test('the web job runs only npm scripts that exist', () => {
  const runs = commands().filter((c) => c.startsWith('npm run ') || c.startsWith('npm test'));
  expect(runs.length).toBeGreaterThanOrEqual(11);
  for (const c of runs) {
    const m = /^npm (?:run ([\w:-]+)|(test))(?: -w (\S+))?/.exec(c);
    expect(m, c).not.toBeNull();
    const [, script, npmTest, workspace] = m as RegExpExecArray;
    expect(scriptsOf(workspace ?? '.'), c).toContain(script ?? npmTest);
  }
});

test('the size budget is 400 kB gzip for all JS and CSS files together', () => {
  const budget = JSON.parse(readFileSync(join(ROOT, 'apps/web-legacy/.size-limit.json'), 'utf8'));
  expect(budget).toEqual([
    { name: expect.any(String), path: ['dist/assets/*.js', 'dist/assets/*.css'], limit: '400 kB', gzip: true },
  ]);
});
