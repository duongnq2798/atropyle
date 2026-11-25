import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import semver from 'semver';

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
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean } | undefined>;
  bundleDependencies?: string[];
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
  /**
   * Where the fix puts it. A missing package has no copy anywhere on the resolution path, so the top level is free;
   * a copy of the wrong version goes under `from`, a bundled one always lives there, and a peer goes next to `from`.
   */
  at: string;
  /** The copy that resolves but does not satisfy the range, as `<path>@<version>`. */
  found?: string;
  /** `from` bundles it: it comes in the tarball of `from`, so only that tarball knows its version. */
  bundled?: boolean;
  /** A peer dependency of `from` that is not optional. */
  peer?: boolean;
}

const isWorkspace = (path: string): boolean => path === '' || !path.includes('node_modules/');

/** The lockfile path of `name` inside the node_modules of `path`. */
const inside = (path: string, name: string): string => `${path === '' ? '' : `${path}/`}node_modules/${name}`;

/** The lockfile path of `name` next to `path`: in the node_modules that holds `path` (the top level for a workspace). */
function nextTo(path: string, name: string): string {
  const i = path.lastIndexOf('/node_modules/');
  return inside(i >= 0 ? path.slice(0, i) : '', name);
}

/** The version at a lockfile path; a workspace link has the version of the workspace it points to. */
function versionAt(packages: Record<string, LockEntry>, path: string): string | undefined {
  const e = packages[path];
  if (e?.link && typeof e.resolved === 'string') return packages[e.resolved]?.version;
  return e?.version;
}

/**
 * npm's rule (@npmcli/arborist, dep-valid.js): '' and '*' take any version, a semver range is matched loosely, and
 * any other spec (a tag, an alias, a file or a git URL) is not checked by version.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const spec = range.trim();
  if (spec === '' || spec === '*' || semver.validRange(spec, true) === null) return true;
  return semver.satisfies(version, spec, true);
}

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

/**
 * Every dependency, devDependency of a workspace and required peer that no entry of the lockfile satisfies, as
 * `npm ci` judges it: missing, or present only in a version outside the range.
 */
export function missingDeps(lock: Lockfile): Missing[] {
  const out: Missing[] = [];
  const seen = new Set<string>();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (entry.link) continue;
    const wanted = new Map<string, { range: string; peer: boolean }>();
    for (const [name, range] of Object.entries(entry.peerDependencies ?? {})) {
      if (!entry.peerDependenciesMeta?.[name]?.optional) wanted.set(name, { range, peer: true });
    }
    const deps = {
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...(isWorkspace(path) ? entry.devDependencies : {}),
    };
    for (const [name, range] of Object.entries(deps)) wanted.set(name, { range, peer: false });
    for (const [name, { range, peer }] of wanted) {
      const bundled = Array.isArray(entry.bundleDependencies) && entry.bundleDependencies.includes(name);
      const own = inside(path, name);
      const hit = bundled ? (lock.packages[own] ? own : null) : resolveIn(lock.packages, path, name);
      const version = hit === null ? undefined : versionAt(lock.packages, hit);
      if (hit !== null && (version === undefined || satisfiesRange(version, range))) continue;
      const at = bundled ? own : peer ? nextTo(path, name) : hit === null ? `node_modules/${name}` : own;
      const key = `${at} ${range}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        range,
        from: path,
        at,
        ...(hit === null ? {} : { found: `${hit}@${version}` }),
        ...(bundled ? { bundled: true } : {}),
        ...(peer ? { peer: true } : {}),
      });
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

export interface FixOptions {
  rounds?: number;
  /**
   * The last committed lockfile: an entry it holds at the same place, in a version that fits, is copied as npm wrote
   * it. The only source for a bundled package, whose entry npm view cannot rebuild.
   */
  previous?: Lockfile;
}

export function fixLock(
  lock: Lockfile,
  view: NpmView,
  o: FixOptions = {},
): { lock: Lockfile; added: string[]; missing: Missing[] } {
  let current = lock;
  const added: string[] = [];
  for (let i = 0; i < (o.rounds ?? 5); i++) {
    const missing = missingDeps(current);
    if (missing.length === 0) return { lock: current, added, missing };
    // A bundled package's place belongs to the version in its bundler's tarball, which npm view cannot tell.
    const bundledAt = new Set(missing.filter((m) => m.bundled).map((m) => m.at));
    const add: Record<string, LockEntry> = {};
    // Dependencies before peers: a peer takes what its neighbours install (rolldown pins emnapi 2.0.0-beta.2, which
    // @napi-rs/wasm-runtime accepts as a peer), so it fills a place only when no dependency asks for that place.
    for (const m of [...missing.filter((n) => !n.peer), ...missing.filter((n) => n.peer)]) {
      // One entry per place in a round; the next round checks every other need against it.
      if (add[m.at]) continue;
      const kept = o.previous?.packages[m.at];
      if (kept?.version !== undefined && !kept.link && satisfiesRange(kept.version, m.range)) {
        add[m.at] = structuredClone(kept);
        added.push(m.at);
        continue;
      }
      if (bundledAt.has(m.at)) continue;
      const parent = current.packages[m.from] ?? {};
      const dev = parent.dev === true || (isWorkspace(m.from) && !!parent.devDependencies?.[m.name]);
      const optional = parent.optional === true || !!parent.optionalDependencies?.[m.name];
      add[m.at] = entryFrom(view(`${m.name}@${m.range}`), dev, optional);
      added.push(m.at);
    }
    if (Object.keys(add).length === 0) break;
    current = withEntries(current, add);
  }
  return { lock: current, added, missing: missingDeps(current) };
}

export function serializeLock(lock: Lockfile): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}
