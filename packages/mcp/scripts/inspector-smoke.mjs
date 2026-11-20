// MCP Inspector 2.15.0 in CLI mode against the built bin. Needs Node >= 24.22.1 and dist/ (npm run build first).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const fixture = fileURLToPath(new URL('../test/fixtures/deployment.json', import.meta.url));

function inspect(...args) {
  const out = execFileSync(
    'npx',
    [
      '-y',
      '@modelcontextprotocol/inspector@2.15.0',
      '--cli',
      'node',
      bin,
      '--deployment',
      fixture,
      '--',
      ...args,
      '--format',
      'json',
      '--protocol-era',
      'modern',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, DISABLE_TELEMETRY: '1' },
      shell: process.platform === 'win32',
      timeout: 120_000,
    },
  );
  // Inspector 2.15.0 wraps the MCP result as {"result": ...}.
  const parsed = JSON.parse(out);
  return parsed.result ?? parsed;
}

function expectThat(ok, what) {
  if (!ok) {
    console.error(`inspector smoke: ${what}`);
    process.exit(1);
  }
}

const tools = inspect('--method', 'tools/list').tools.map((t) => t.name);
expectThat(
  tools.length === 7 && tools.every((n) => n.startsWith('atropyle_')),
  `expected 7 atropyle_* tools, got ${tools.join(', ')}`,
);
const prompts = inspect('--method', 'prompts/list')
  .prompts.map((p) => p.name)
  .sort();
expectThat(prompts.join() === 'guardian_briefing,plan_inheritance', `unexpected prompts ${prompts.join(', ')}`);
const resources = inspect('--method', 'resources/list').resources.map((r) => r.uri);
expectThat(resources.includes('atropyle://policy/spec'), `policy spec missing from ${resources.join(', ')}`);
const spec = inspect('--method', 'resources/read', '--uri', 'atropyle://policy/spec');
expectThat(JSON.stringify(spec).includes('| P8 |'), 'policy spec has no P8 row');
console.log(`inspector smoke: ok (${tools.length} tools, ${prompts.length} prompts)`);
