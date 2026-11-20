import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Everything the CLI touches outside itself. Unit tests pass an in-memory version (test/unit/memory-io.ts). */
export interface Io {
  out(text: string): void;
  err(text: string): void;
  /** stdout is a terminal: colors, QR codes and progress are allowed. */
  isTTY: boolean;
  /** stdin is a terminal: questions are allowed. */
  stdinTTY: boolean;
  columns: number;
  env: Readonly<Record<string, string | undefined>>;
  nodeVersion: string;
  cwd: string;
  fetch: typeof fetch;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string, o?: { exclusive?: boolean }): Promise<void>;
}

export function processIo(): Io {
  const cwd = process.cwd();
  return {
    out: (t) => void process.stdout.write(t),
    err: (t) => void process.stderr.write(t),
    isTTY: process.stdout.isTTY === true,
    stdinTTY: process.stdin.isTTY === true,
    columns: process.stdout.columns ?? 80,
    env: process.env,
    nodeVersion: process.version,
    cwd,
    fetch: globalThis.fetch,
    readFile: (p) => readFile(resolve(cwd, p), 'utf8'),
    writeFile: (p, d, o) => writeFile(resolve(cwd, p), d, { encoding: 'utf8', flag: o?.exclusive ? 'wx' : 'w' }),
  };
}
