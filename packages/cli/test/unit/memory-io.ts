import type { Io } from '../../src/io';

export interface MemoryIo extends Io {
  stdout: string;
  stderr: string;
  files: Map<string, string>;
}

/** No terminal, no network, files in a map, and an empty environment so ATROPYLE_* of the shell never leaks in. */
export function memoryIo(o: Partial<Io> & { files?: Record<string, string> } = {}): MemoryIo {
  const { files: initial, ...rest } = o;
  const files = new Map(Object.entries(initial ?? {}));
  const io: MemoryIo = {
    stdout: '',
    stderr: '',
    files,
    out: (t) => {
      io.stdout += t;
    },
    err: (t) => {
      io.stderr += t;
    },
    isTTY: false,
    stdinTTY: false,
    columns: 80,
    env: {},
    nodeVersion: 'v24.11.0',
    cwd: '/work',
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
      return v;
    },
    writeFile: async (p, d, w) => {
      if (w?.exclusive && files.has(p)) throw Object.assign(new Error(`EEXIST: ${p}`), { code: 'EEXIST' });
      files.set(p, d);
    },
    ...rest,
  };
  return io;
}
