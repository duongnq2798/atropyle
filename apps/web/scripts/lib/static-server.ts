import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

/** Text that Vercel compresses on the way out; woff2, images and wasm are compressed already. */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|manifest\+json)|image\/svg\+xml)/;

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves a static export like Vercel and the DeWEB gateway: `/x/` and `/x` read `x/index.html`, anything missing
 * gets `404.html` with status 404. Port 0 picks a free port.
 */
export async function startStaticServer(
  root: string,
  port = 0,
  headers: Record<string, string> = {},
): Promise<{ port: number; url: string; close(): Promise<void> }> {
  const server = createServer(async (req, res) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const rel = normalize(path).replace(/^[/\\]+/, '');
    if (rel.startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    const candidates = [join(root, rel), join(root, rel, 'index.html')];
    let file: string | null = null;
    for (const c of candidates) {
      if (await isFile(c)) {
        file = c;
        break;
      }
    }
    const status = file ? 200 : 404;
    const target = file ?? join(root, '404.html');
    try {
      const body = await readFile(target);
      const type = TYPES[extname(target)] ?? 'application/octet-stream';
      // Lighthouse simulates a slow network from the bytes on the wire, so text goes out gzipped as on Vercel.
      const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      res.writeHead(status, {
        ...headers,
        'content-type': type,
        'cache-control': 'no-store',
        vary: 'accept-encoding',
        ...(gzip ? { 'content-encoding': 'gzip' } : {}),
      });
      res.end(gzip ? gzipSync(body) : body);
    } catch {
      res.writeHead(404, headers).end('not found');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const bound = typeof addr === 'object' && addr ? addr.port : port;
  return {
    port: bound,
    url: `http://127.0.0.1:${bound}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
