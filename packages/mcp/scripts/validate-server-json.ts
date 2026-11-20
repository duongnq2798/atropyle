// Offline check of server.json (decision 14): JSON Schema with ajv, then the rules the registry applies at publish time.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SERVER_SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

interface ServerJson {
  $schema?: string;
  name?: string;
  description?: string;
  version?: string;
  repository?: { url?: string; source?: string };
  packages?: { registryType?: string; identifier?: string; version?: string; transport?: { type?: string } }[];
}

export function checkServerJson(server: unknown, pkg: { name: string; version: string; mcpName?: string }): string[] {
  const s = server as ServerJson;
  const issues: string[] = [];
  if (s.$schema !== SERVER_SCHEMA_URL) issues.push(`$schema must be ${SERVER_SCHEMA_URL}`);
  if (s.name !== pkg.mcpName) issues.push(`name ${s.name} differs from mcpName ${pkg.mcpName} in package.json`);
  const repo = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(s.repository?.url ?? '');
  if (!repo || repo[2].endsWith('.git'))
    issues.push('repository.url must be a bare https://github.com/<owner>/<repo> URL');
  if (s.repository?.source !== 'github') issues.push('repository.source must be github');
  // Registry auth by GitHub grants exactly io.github.<owner>/*, case-sensitive.
  if (repo && !s.name?.startsWith(`io.github.${repo[1]}/`)) {
    issues.push(`name must be in the namespace io.github.${repo[1]}/`);
  }
  const d = s.description ?? '';
  if (d.length < 1 || d.length > 100) issues.push(`description must be 1-100 characters, has ${d.length}`);
  if (s.version !== pkg.version) issues.push(`version ${s.version} differs from package.json ${pkg.version}`);
  const p = s.packages ?? [];
  if (p.length !== 1) issues.push('packages must list exactly the npm package');
  for (const [i, q] of p.entries()) {
    if (q.registryType !== 'npm') issues.push(`packages[${i}].registryType must be npm`);
    if (q.identifier !== pkg.name) issues.push(`packages[${i}].identifier must be ${pkg.name}`);
    if (q.version === 'latest') issues.push(`packages[${i}].version must not be latest`);
    else if (q.version !== pkg.version) issues.push(`packages[${i}].version ${q.version} differs from ${pkg.version}`);
    if (q.transport?.type !== 'stdio') issues.push(`packages[${i}].transport.type must be stdio`);
  }
  return issues;
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const server = JSON.parse(readFileSync(resolve(root, 'server.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'packages/mcp/package.json'), 'utf8'));
  const schema = await (await fetch(SERVER_SCHEMA_URL)).json();
  // The registry schema is draft-07 and uses the non-standard `example` keyword: strict mode would reject it.
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const issues = validate(server)
    ? []
    : (validate.errors ?? []).map((e) => `schema: ${e.instancePath || '/'} ${e.message}`);
  issues.push(...checkServerJson(server, pkg));
  if (issues.length > 0) {
    for (const i of issues) console.error(`server.json: ${i}`);
    process.exit(1);
  }
  console.log('server.json: ok');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
