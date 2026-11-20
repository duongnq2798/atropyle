import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VERSION } from '../../src/version';

const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/deployment.json', import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 20_000 });

beforeAll(() => {
  if (!existsSync(BIN)) throw new Error('Build first: npm run build -w packages/mcp');
});

describe('atropyle-mcp bin', () => {
  it('keeps its shebang', () => {
    expect(readFileSync(BIN, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node');
  });

  it('prints its version and help', () => {
    expect(run('--version').stdout).toBe(`${VERSION}\n`);
    const help = run('--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: atropyle-mcp');
  });

  it('without a deployment, exits 1 and says to pass --deployment', () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ATROPYLE_')));
    const r = spawnSync(process.execPath, [BIN], { encoding: 'utf8', timeout: 20_000, env });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('DEPLOYMENT_MISSING');
    expect(r.stderr).toContain('--deployment <file>');
    expect(r.stderr).toContain('ATROPYLE_DEPLOYMENT');
  });

  it('exits 1 on a bad flag, with the error on stderr only', () => {
    const r = run('--chain', 'mars');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('INVALID_OPTIONS');
  });
});

describe('stdio session', () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client(
      { name: 'atropyle-e2e', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [BIN, '--deployment', FIXTURE], stderr: 'pipe' }),
    );
  });
  afterAll(async () => {
    await client?.close();
  });

  it('serves 7 tools, the resources and the prompts', async () => {
    expect(client.getDiscoverResult()?.instructions).toContain('untrusted');
    expect((await client.listTools()).tools).toHaveLength(7);
    const spec = await client.readResource({ uri: 'atropyle://policy/spec' });
    expect((spec.contents[0] as { text: string }).text).toContain('| P8 |');
    expect((await client.listPrompts()).prompts).toHaveLength(2);
  });

  it('answers a failing read with an error result and keeps running', async () => {
    const r = await client.callTool({
      name: 'atropyle_get_vault',
      arguments: { vault: '0x1000000000000000000000000000000000000009' },
    });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    const envelope = JSON.parse((r.content as { text: string }[])[1].text);
    expect(envelope.error.code).toBe('RPC_UNAVAILABLE');
    expect((await client.listTools()).tools).toHaveLength(7);
  });
});
