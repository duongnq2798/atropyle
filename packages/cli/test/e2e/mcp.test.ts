import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';
import { BIN } from './bin';
import { DEP, devnet } from './helpers';

/** Connects the built CLI as an MCP client would; `errors` collects everything the protocol layer complains about. */
async function connect(extra: string[]) {
  const errors: unknown[] = [];
  const client = new Client({ name: 'atropyle-cli-e2e', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, 'mcp', ...extra, ...DEP()],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString('utf8');
  });
  client.onerror = (e) => errors.push(e);
  transport.onerror = (e) => errors.push(e);
  await client.connect(transport);
  return { client, errors, stderr: () => stderr };
}

describe('atropyle mcp', () => {
  it('serves the 7 tools on stdio, reads the devnet, and keeps stdout for MCP only', async () => {
    const { client, errors } = await connect([]);
    try {
      expect((await client.listTools()).tools).toHaveLength(7);
      const r = await client.callTool({ name: 'atropyle_get_vault', arguments: { vault: devnet().vaults.guarded } });
      expect(r.isError ?? false).toBe(false);
      expect((r.structuredContent as { status: { state: string } }).status.state).toBe('active');
      // A stray stdout line would arrive here as a parse error.
      expect(errors).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('starts anyway when the --rpc does not answer, and prints a note without the URL', async () => {
    const { client, errors, stderr } = await connect(['--rpc', 'http://127.0.0.1:1']);
    try {
      expect((await client.listTools()).tools).toHaveLength(7);
      expect(errors).toEqual([]);
      expect(stderr()).toContain('atropyle-mcp: the RPC did not answer; starting anyway');
      expect(stderr()).not.toContain('127.0.0.1:1');
    } finally {
      await client.close();
    }
  });
});
