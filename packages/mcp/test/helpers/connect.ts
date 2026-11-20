import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';

export interface Connected {
  client: Client;
  close(): Promise<void>;
}

/** In-memory client on the 2026-07-28 protocol (SDK docs/testing.md): no network, no subprocess. */
export async function connect(factory: () => McpServer): Promise<Connected> {
  const handler = createMcpHandler(factory);
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: 'atropyle-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
