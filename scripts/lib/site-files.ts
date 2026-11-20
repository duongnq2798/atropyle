import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

type Hex = `0x${string}`;

/** SiteRegistry.CHUNK_MAX() on X Layer (read on-chain, Quyết định 11). */
export const CHUNK_MAX = 24_000;
/** TapeKit limits: 350 chunks per file, 5,000 paths per site. */
export const LIMITS = { fileBytes: 8_400_000, paths: 5_000 } as const;

export const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
};

export function contentTypeOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'application/octet-stream';
  return CONTENT_TYPES[name.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream';
}

/** Site paths relative to `root`, with `/` separators, sorted. Skips dot files, dot folders and source maps. */
export function walkSite(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name.endsWith('.map')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(root, full).split(sep).join('/'));
    }
  };
  visit(root);
  return out.sort();
}

/** An empty file is one empty chunk: putFile always carries the first chunk. */
export function chunk(bytes: Uint8Array, size = CHUNK_MAX): Uint8Array[] {
  if (bytes.length === 0) return [new Uint8Array(0)];
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}

export function sha256Hex(bytes: Uint8Array): Hex {
  return `0x${createHash('sha256').update(bytes).digest('hex')}`;
}

export interface SiteFile {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  sha256: Hex;
  chunks: Uint8Array[];
}

export function makeSiteFile(path: string, bytes: Uint8Array): SiteFile {
  return { path, bytes, contentType: contentTypeOf(path), sha256: sha256Hex(bytes), chunks: chunk(bytes) };
}

export function loadSite(root: string): SiteFile[] {
  return walkSite(root).map((path) => makeSiteFile(path, new Uint8Array(readFileSync(join(root, path)))));
}

export function limitProblems(files: readonly SiteFile[]): string[] {
  const out: string[] = [];
  if (files.length > LIMITS.paths) out.push(`${files.length} paths, the limit is ${LIMITS.paths}`);
  for (const f of files) {
    if (f.bytes.length > LIMITS.fileBytes) {
      out.push(`${f.path}: ${f.bytes.length} bytes, the limit is ${LIMITS.fileBytes}`);
    }
  }
  return out;
}
