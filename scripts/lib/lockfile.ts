import { spawnSync } from 'node:child_process';

export interface LockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  dev?: boolean;
  optional?: boolean;
  license?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface Lockfile {
  name?: string;
  lockfileVersion: number;
  requires?: boolean;
  packages: Record<string, LockEntry>;
  [key: string]: unknown;
}

export interface Missing {
  name: string;
  range: string;
  /** The lockfile path of the package that depends on it. */
  from: string;
  /** Where npm puts it: a missing package has no copy anywhere on the resolution path, so the top level is free. */
  at: string;
}

const isWorkspace = (path: string): boolean => path === '' || !path.includes('node_modules/');

/** Node's lookup: the package's own node_modules, then every parent's, then the root's. */
export function resolveIn(packages: Record<string, LockEntry>, from: string, name: string): string | null {
  let base = from;
  for (;;) {
    const candidate = base === '' ? `node_modules/${name}` : `${base}/node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (base === '') return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i >= 0 ? base.slice(0, i) : '';
  }
}

/** Every dependency (and every devDependency of a workspace) that no entry of the lockfile satisfies. */
export function missingDeps(lock: Lockfile): Missing[] {
  const out: Missing[] = [];
  const seen = new Set<string>();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (entry.link) continue;
    const deps: Record<string, string> = {
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...(isWorkspace(path) ? entry.devDependencies : {}),
    };
    for (const [name, range] of Object.entries(deps)) {
      if (resolveIn(lock.packages, path, name)) continue;
      const key = `${name}@${range}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, range, from: path, at: `node_modules/${name}` });
    }
  }
  return out;
}

/** npm writes the root entry first, then every path in `localeCompare` order (checked against the real file). */
export function withEntries(lock: Lockfile, add: Record<string, LockEntry>): Lockfile {
  const all = { ...lock.packages, ...add };
  const keys = Object.keys(all).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'en')));
  const packages: Record<string, LockEntry> = {};
  for (const k of keys) packages[k] = all[k] as LockEntry;
  return { ...lock, packages };
}

export function entryFrom(view: unknown, dev: boolean, optional: boolean): LockEntry {
  const picked = Array.isArray(view) ? view[view.length - 1] : view;
  const o = (picked ?? {}) as Record<string, unknown>;
  const version = o.version;
  const resolved = o['dist.tarball'];
  const integrity = o['dist.integrity'];
  if (typeof version !== 'string' || typeof resolved !== 'string' || typeof integrity !== 'string') {
    throw new Error('npm view returned no version, tarball or integrity');
  }
  // Same key order as npm: version, resolved, integrity, dev, license, optional, dependencies.
  const e: LockEntry = { version, resolved, integrity };
  if (dev) e.dev = true;
  if (typeof o.license === 'string') e.license = o.license;
  if (optional) e.optional = true;
  const deps = o.dependencies;
  if (deps && typeof deps === 'object' && Object.keys(deps).length > 0) e.dependencies = deps as Record<string, string>;
  return e;
}

export type NpmView = (spec: string) => unknown;

/** `npm` is a .cmd on Windows, so it runs through a shell there; the quotes keep `^` and `<` literal for cmd.exe. */
export const npmView: NpmView = (spec) => {
  const win = process.platform === 'win32';
  const r = spawnSync(
    'npm',
    [
      'view',
      win ? `"${spec}"` : spec,
      'version',
      'dist.tarball',
      'dist.integrity',
      'license',
      'dependencies',
      '--json',
    ],
    { encoding: 'utf8', shell: win, windowsHide: true },
  );
  if (r.status !== 0) throw new Error(`npm view ${spec} failed:\n${r.stderr}`);
  return JSON.parse(r.stdout) as unknown;
};

export function fixLock(
  lock: Lockfile,
  view: NpmView,
  rounds = 5,
): { lock: Lockfile; added: string[]; missing: Missing[] } {
  let current = lock;
  const added: string[] = [];
  for (let i = 0; i < rounds; i++) {
    const missing = missingDeps(current);
    if (missing.length === 0) return { lock: current, added, missing };
    const add: Record<string, LockEntry> = {};
    for (const m of missing) {
      const parent = current.packages[m.from] ?? {};
      const dev = parent.dev === true || (isWorkspace(m.from) && !!parent.devDependencies?.[m.name]);
      const optional = parent.optional === true || !!parent.optionalDependencies?.[m.name];
      add[m.at] = entryFrom(view(`${m.name}@${m.range}`), dev, optional);
      added.push(m.at);
    }
    current = withEntries(current, add);
  }
  return { lock: current, added, missing: missingDeps(current) };
}

export function serializeLock(lock: Lockfile): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}
