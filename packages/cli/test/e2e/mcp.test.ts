import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';
import { BIN } from './bin';
import { DEP, devnet } from './helpers';

describe('atropyle mcp', () => {
  it('serves the 7 tools on stdio and reads the devnet', async () => {
    const client = new Client({ name: 'atropyle-cli-e2e', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp', ...DEP()], stderr: 'pipe' }),
    );
    try {
      expect((await client.listTools()).tools).toHaveLength(7);
      const r = await client.callTool({ name: 'atropyle_get_vault', arguments: { vault: devnet().vaults.guarded } });
      expect(r.isError ?? false).toBe(false);
      expect((r.structuredContent as { status: { state: string } }).status.state).toBe('active');
    } finally {
      await client.close();
    }
  });
});
