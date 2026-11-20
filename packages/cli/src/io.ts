import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

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
  /** Asks one question on stderr and reads one line. null: the user stopped (Ctrl+C, Ctrl+D). */
  prompt?: (question: string) => Promise<string | null>;
}

function ask(question: string): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    let answered = false;
    rl.on('SIGINT', () => rl.close());
    rl.on('close', () => {
      if (!answered) resolve(null);
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
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
    prompt: ask,
  };
}
