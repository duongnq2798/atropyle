import { createAtropyle } from '@atropyle/sdk';
import { type AtropyleMcpOptions, buildMcpServer } from './server';

type StdioModule = typeof import('@modelcontextprotocol/server/stdio');
/** Not a string literal: a Worker bundler must not follow this import (decision 8). */
const STDIO_MODULE = '@modelcontextprotocol/server/stdio';

/** Serves the 7 tools on stdin/stdout. Only JSON-RPC goes to stdout. */
export async function runStdio(o: Partial<AtropyleMcpOptions> = {}): Promise<void> {
  const opts: AtropyleMcpOptions = { ...o, sdk: o.sdk ?? { chain: 'xlayer' } };
  // One SDK client for every factory call: serveStdio may build the server twice (discover, then legacy fallback),
  // and the verifyPolicy cache must survive that.
  const atro = createAtropyle(opts.sdk);
  const { serveStdio } = (await import(/* @vite-ignore */ STDIO_MODULE)) as StdioModule;
  serveStdio(() => buildMcpServer(atro, opts));
}
