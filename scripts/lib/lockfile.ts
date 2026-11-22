import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
  if (deps && typeof deps === 'object' && Object.keys(deps).length > 0) {
    // npm lists dependencies sorted; npm view prints them in the order of the manifest.
    const sorted = Object.entries(deps as Record<string, string>).sort(([a], [b]) => a.localeCompare(b, 'en'));
    e.dependencies = Object.fromEntries(sorted);
  }
  return e;
}

export type NpmView = (spec: string) => unknown;

const SAFE_SPEC = /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+@[\w.^~<>=|*\s-]+$/;

/** A spec comes from the lockfile, which a PR can change: only package names and semver ranges pass. */
export function assertSafeSpec(spec: string): string {
  if (!SAFE_SPEC.test(spec)) throw new Error(`unsafe package spec: ${JSON.stringify(spec)}`);
  return spec;
}

/** npm's own entry script, so npm runs as `node npm-cli.js` with no shell (a .cmd needs one on Windows). */
function npmCli(): string {
  const bin = dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath?.endsWith('npm-cli.js') ? process.env.npm_execpath : '',
    join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find((c) => c !== '' && existsSync(c));
  if (!found) throw new Error('cannot find npm-cli.js next to node; run this through npm run');
  return found;
}

export const npmView: NpmView = (spec) => {
  const r = spawnSync(
    process.execPath,
    [
      npmCli(),
      'view',
      assertSafeSpec(spec),
      'version',
      'dist.tarball',
      'dist.integrity',
      'license',
      'dependencies',
      '--json',
    ],
    { encoding: 'utf8', shell: false, windowsHide: true },
  );
  if (r.status !== 0)
    throw new Error(`npm view ${spec} failed:
${r.stderr}`);
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
