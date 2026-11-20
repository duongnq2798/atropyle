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
  with?: Record<string, unknown>;
}
interface Job {
  'timeout-minutes'?: number;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps: Step[];
}

const yamlText = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const workflow = parse(yamlText) as { jobs: Record<string, Job> };
const job = workflow.jobs['cli-mcp'] as Job;
const scriptsOf = (dir: string): string[] =>
  Object.keys(
    (JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {},
  );
const commands = (): string[] =>
  job.steps
    .flatMap((s) => (s.run ?? '').split(/&&|\n/))
    .map((c) => c.trim())
    .filter((c) => c !== '');

describe('CI job cli-mcp', () => {
  it('sits next to the jobs of the other plans', () => {
    expect(Object.keys(workflow.jobs)).toEqual(
      expect.arrayContaining(['circuits', 'contracts', 'lint', 'sdk', 'sdk-integration', 'cli-mcp']),
    );
  });

  it('has a timeout', () => {
    expect(job['timeout-minutes']).toBeGreaterThan(0);
  });

  it('reads only, holds no secret and signs nothing', () => {
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(JSON.stringify(job)).not.toMatch(
      /secrets\.|PRIVATE_KEY|KEEPER_KEY|cast send|eth_sendRawTransaction|npm publish|mcp-publisher/,
    );
    expect(job.env).toMatchObject({ DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  });

  it('pins every tool it downloads', () => {
    const downloads = commands().flatMap((c) => [...c.matchAll(/npx -y (\S+)/g)].map((m) => m[1]));
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    for (const d of downloads) expect(d).toMatch(/@\d+\.\d+\.\d+$/);
    const installs = commands().filter((c) => c.startsWith('pip install'));
    expect(installs.length).toBeGreaterThanOrEqual(1);
    for (const c of installs) expect(c).toMatch(/==\d+\.\d+\.\d+$/);
  });

  it('runs only npm scripts that exist', () => {
    const runs = commands().filter((c) => c.startsWith('npm run '));
    expect(runs.length).toBeGreaterThan(10);
    for (const c of runs) {
      const m = /^npm run ([\w:-]+) -w (\S+)/.exec(c);
      expect(m, c).not.toBeNull();
      const [, script, workspace] = m as RegExpExecArray;
      expect(scriptsOf(workspace as string), c).toContain(script);
    }
  });
});
