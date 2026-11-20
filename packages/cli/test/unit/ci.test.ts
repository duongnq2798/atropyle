import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
}
interface Job {
  'timeout-minutes'?: number;
  permissions?: Record<string, string>;
  env?: Record<string, unknown>;
  steps: Step[];
}
interface Workflow {
  jobs: Record<string, Job>;
}

const REQUIRED_JOBS = ['circuits', 'contracts', 'lint', 'sdk', 'sdk-node20', 'sdk-integration', 'cli-mcp'];
const TELEMETRY = { DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
// Matched against the whole file: a secret in a workflow-level env or in another job is as bad as one in cli-mcp.
const FORBIDDEN =
  /\bsecrets\b|PRIVATE_KEY|KEEPER_KEY|cast send|eth_sendRawTransaction|npm publish|mcp-publisher|\bgithub\.token\b|GITHUB_TOKEN/;
const PINNED = /(@|==)\d+\.\d+\.\d+$/;

const scriptsOf = (dir: string): string[] =>
  Object.keys(
    (JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {},
  );

const commandsOf = (job: Job): string[] =>
  job.steps
    .flatMap((s) => (s.run ?? '').split(/&&|\|\||;|\||\n/))
    .map((c) => c.trim())
    .filter((c) => c !== '');

/** The packages a command downloads: [] for anything that is not a download. Local bins go through `npm run`. */
function downloadsOf(command: string): string[] {
  const t = command.split(/\s+/);
  const operands = (from: number): string[] => t.slice(from).filter((x) => !x.startsWith('-'));
  if (t[0] === 'npx' || t[0] === 'uvx') return operands(1).slice(0, 1);
  if (t[0] === 'npm' && t[1] === 'exec') return operands(2).slice(0, 1);
  if (t[0] === 'pipx') return operands(2).slice(0, 1);
  if ((t[0] === 'pip' || t[0] === 'pip3') && t[1] === 'install') return operands(2);
  if (/^python3?$/.test(t[0] ?? '') && t[1] === '-m' && t[2] === 'pip' && t[3] === 'install') return operands(4);
  return [];
}

/** The rules a workflow text breaks; the real ci.yml must break none. */
function violations(yamlText: string): string[] {
  const broken: string[] = [];
  const workflow = parse(yamlText) as Workflow;
  const job = workflow.jobs['cli-mcp'];
  for (const name of REQUIRED_JOBS) if (!workflow.jobs[name]) broken.push(`job ${name} missing`);
  if (FORBIDDEN.test(yamlText)) broken.push('forbidden pattern');
  if (!job) return broken;

  if (!((job['timeout-minutes'] ?? 0) > 0)) broken.push('no timeout');
  if (JSON.stringify(job.permissions) !== JSON.stringify({ contents: 'read' })) {
    broken.push('permissions not contents: read');
  }
  for (const [k, v] of Object.entries(TELEMETRY)) {
    if (job.env?.[k] !== v) broken.push(`telemetry ${k} not set`);
    for (const s of job.steps) if (s.env && k in s.env && s.env[k] !== v) broken.push(`step overrides ${k}`);
  }
  const checkout = job.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  if (checkout?.with?.['persist-credentials'] !== false) broken.push('checkout keeps credentials');

  const commands = commandsOf(job);
  for (const c of commands) {
    for (const d of downloadsOf(c)) if (!PINNED.test(d)) broken.push(`unpinned download: ${c}`);
  }
  if (!commands.some((c) => c.startsWith('pip install'))) broken.push('no pip install');

  let npmRuns = 0;
  for (const c of commands) {
    const isTest = /^npm test\b/.test(c);
    const run = /^npm run ([\w:-]+)/.exec(c);
    if (!isTest && !run) continue;
    const ws = /(?:-w|--workspace)(?:=|\s+)(\S+)/.exec(c);
    if (!ws) {
      broken.push(`no workspace: ${c}`);
      continue;
    }
    npmRuns += 1;
    const script = isTest ? 'test' : (run?.[1] ?? '');
    if (!scriptsOf(ws[1] ?? '').includes(script)) broken.push(`no such script: ${c}`);
  }
  if (npmRuns <= 10) broken.push('too few npm runs');
  return broken;
}

const realText = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
/** Edit the whole file. */
const anywhere = (edit: (t: string) => string): string => edit(realText);
/** Edit only the cli-mcp job (the last one). */
const inJob = (edit: (jobText: string) => string): string => {
  const i = realText.indexOf('\n  cli-mcp:');
  return realText.slice(0, i) + edit(realText.slice(i));
};
// A GitHub expression, built here so that Biome does not take the braces for a forgotten template literal.
const expr = (e: string): string => `\${{ ${e} }}`;
const NPM_CI = '- run: npm ci\n';
const replaceNpmCi = (run: string): string => inJob((j) => j.replace(NPM_CI, `- run: ${run}\n`));
const addStepEnv = (line: string): string =>
  inJob((j) => j.replace(NPM_CI, `${NPM_CI}        env:\n          ${line}\n`));

describe('CI job cli-mcp', () => {
  it('breaks no rule in the real ci.yml', () => {
    expect(violations(realText)).toEqual([]);
  });

  // Each case is a copy of ci.yml with one rule broken; the text is the start of the rule's message.
  it.each([
    ['a required job gone', anywhere((t) => t.replace('\n  sdk-node20:', '\n  sdk-node21:')), 'job sdk-node20 missing'],
    ['cli-mcp renamed', anywhere((t) => t.replace('\n  cli-mcp:', '\n  cli-other:')), 'job cli-mcp missing'],
    ['no timeout', inJob((j) => j.replace('    timeout-minutes: 40\n', '')), 'no timeout'],
    ['wider permissions', inJob((j) => j.replace('contents: read', 'contents: write')), 'permissions not'],
    [
      'extra permission',
      inJob((j) => j.replace('contents: read\n', 'contents: read\n      id-token: write\n')),
      'permissions not',
    ],
    [
      'stored checkout credential',
      inJob((j) => j.replace('          persist-credentials: false\n', '')),
      'checkout keeps credentials',
    ],
    ['telemetry env dropped', inJob((j) => j.replace('DISABLE_TELEMETRY', 'X')), 'telemetry DISABLE_TELEMETRY not set'],
    ['telemetry overridden in a step', addStepEnv('DISABLE_TELEMETRY: "0"'), 'step overrides DISABLE_TELEMETRY'],
    ['secrets.X in a step', addStepEnv(`X: ${expr('secrets.X')}`), 'forbidden pattern'],
    [
      'secrets in a workflow-level env',
      anywhere((t) => t.replace('\njobs:', `\nenv:\n  NPM_TOKEN: ${expr('secrets.NPM_TOKEN')}\njobs:`)),
      'forbidden pattern',
    ],
    [
      'secrets in another job',
      anywhere((t) => t.replace('  lint:\n', `  lint:\n    env:\n      T: ${expr('secrets.T')}\n`)),
      'forbidden pattern',
    ],
    ['secrets[...]', addStepEnv(`T: ${expr("secrets['NPM_TOKEN']")}`), 'forbidden pattern'],
    ['toJSON(secrets)', addStepEnv(`T: ${expr('toJSON(secrets)')}`), 'forbidden pattern'],
    [
      'secrets: inherit',
      anywhere((t) => `${t}\n  call:\n    uses: ./.github/workflows/x.yml\n    secrets: inherit\n`),
      'forbidden pattern',
    ],
    ['github.token', addStepEnv(`T: ${expr('github.token')}`), 'forbidden pattern'],
    ['GITHUB_TOKEN', addStepEnv('GITHUB_TOKEN: x'), 'forbidden pattern'],
    ['PRIVATE_KEY', addStepEnv('PRIVATE_KEY: x'), 'forbidden pattern'],
    ['KEEPER_KEY', addStepEnv('KEEPER_KEY: x'), 'forbidden pattern'],
    ['cast send', replaceNpmCi('cast send 0x0'), 'forbidden pattern'],
    ['npm publish', replaceNpmCi('npm publish'), 'forbidden pattern'],
    ['mcp-publisher', replaceNpmCi('mcp-publisher publish'), 'forbidden pattern'],
    [
      'claude-code unpinned',
      inJob((j) => j.replace('claude-code@2.1.327', 'claude-code@latest')),
      'unpinned download: npx -y @anthropic-ai/claude-code@latest',
    ],
    ['skills unpinned', inJob((j) => j.replace('skills@1.9.0', 'skills')), 'unpinned download: npx -y skills add'],
    ['npx', replaceNpmCi('npx some-tool'), 'unpinned download: npx some-tool'],
    ['npx --yes', replaceNpmCi('npx --yes some-tool'), 'unpinned download: npx --yes some-tool'],
    ['npm exec', replaceNpmCi('npm exec some-tool'), 'unpinned download: npm exec some-tool'],
    ['uvx', replaceNpmCi('uvx some-tool'), 'unpinned download: uvx some-tool'],
    ['pipx', replaceNpmCi('pipx run some-tool'), 'unpinned download: pipx run some-tool'],
    ['pip3', replaceNpmCi('pip3 install some-tool'), 'unpinned download: pip3 install some-tool'],
    ['pip unpinned', inJob((j) => j.replace('skills-ref==0.1.1', 'skills-ref')), 'unpinned download: pip install'],
    [
      'pip, second package unpinned',
      inJob((j) => j.replace('pip install skills-ref==0.1.1', 'pip install strictyaml skills-ref==0.1.1')),
      'unpinned download: pip install strictyaml',
    ],
    ['python -m pip', replaceNpmCi('python -m pip install other'), 'unpinned download: python -m pip install other'],
    [
      'missing script',
      inJob((j) => j.replace('npm run smoke -w', 'npm run nosuch -w')),
      'no such script: npm run nosuch -w examples/agent-mcp-client',
    ],
    [
      'missing script after ;',
      replaceNpmCi('a; npm run nosuch -w packages/cli'),
      'no such script: npm run nosuch -w packages/cli',
    ],
    [
      'missing script after ||',
      replaceNpmCi('a || npm run nosuch -w packages/cli'),
      'no such script: npm run nosuch -w packages/cli',
    ],
    [
      'missing script after |',
      replaceNpmCi('a | npm run nosuch -w packages/cli'),
      'no such script: npm run nosuch -w packages/cli',
    ],
    [
      '--workspace=',
      replaceNpmCi('npm run nosuch --workspace=packages/cli'),
      'no such script: npm run nosuch --workspace=packages/cli',
    ],
    [
      '--workspace <ws>',
      replaceNpmCi('npm run nosuch --workspace packages/cli'),
      'no such script: npm run nosuch --workspace packages/cli',
    ],
    [
      'npm test in a workspace without a test script',
      replaceNpmCi('npm test -w examples/agent-mcp-client'),
      'no such script: npm test -w examples/agent-mcp-client',
    ],
  ])('flags %s', (_name, text, rule) => {
    expect(violations(text).some((v) => v.startsWith(rule))).toBe(true);
  });
});
