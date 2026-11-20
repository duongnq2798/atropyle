import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

/** Serves `root` on 127.0.0.1. Pass port 0 for a free port; the bound port is returned. */
export async function startStaticServer(root: string, port = 0): Promise<{ port: number; close(): Promise<void> }> {
  const server = createServer(async (req, res) => {
    // For non-Chromium projects, which preflight cross-origin requests to the site.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*' }).end();
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^[/\\]+/, '');
    if (rel.startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(join(root, rel));
      res.writeHead(200, {
        'content-type': TYPES[extname(rel)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const bound = typeof addr === 'object' && addr ? addr.port : port;
  return { port: bound, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
