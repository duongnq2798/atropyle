import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertSafeSpec,
  entryFrom,
  fixLock,
  type LockEntry,
  type Lockfile,
  missingDeps,
  type NpmView,
  resolveIn,
  serializeLock,
  withEntries,
} from '../../lib/lockfile';

const FILE = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/lock-emnapi.json', import.meta.url));
const raw = () => readFileSync(FILE, 'utf8');
const real = (): Lockfile => JSON.parse(raw()) as Lockfile;
// Frozen copy of the two entries npm on Windows drops; later installs change the live ones.
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, LockEntry>;
const CORE = 'node_modules/@emnapi/core';
const RUNTIME = 'node_modules/@emnapi/runtime';
/** npm on Windows drops these too: a nested copy for sharp, and two bundled in the wasm build of tailwind's oxide. */
const SHARP_RUNTIME = 'node_modules/@img/sharp-wasm32/node_modules/@emnapi/runtime';
const OXIDE = 'node_modules/@tailwindcss/oxide-wasm32-wasi';
const OXIDE_CORE = `${OXIDE}/node_modules/@emnapi/core`;
const OXIDE_RUNTIME = `${OXIDE}/node_modules/@emnapi/runtime`;

function without(...paths: string[]): Lockfile {
  const lock = real();
  for (const p of paths) delete lock.packages[p];
  return lock;
}
const stripped = (): Lockfile => without(CORE, RUNTIME);

/** What `npm view <spec> version dist.tarball dist.integrity license dependencies --json` prints, built from the fixture. */
const viewFromFixture: NpmView = (spec) => {
  const at = spec.lastIndexOf('@');
  const e = fixture[spec.slice(0, at)];
  if (!e) throw new Error(`no fixture for ${spec}`);
  return {
    version: e.version,
    'dist.tarball': e.resolved,
    'dist.integrity': e.integrity,
    license: e.license,
    ...(e.dependencies ? { dependencies: e.dependencies } : {}),
  };
};

/** npm view by exact spec: a spec the test did not expect throws, so a fix that asks for the wrong range fails. */
const viewOf =
  (answers: Record<string, LockEntry | undefined>): NpmView =>
  (spec) => {
    const e = answers[spec];
    if (!e) throw new Error(`unexpected npm view ${spec}`);
    return {
      version: e.version,
      'dist.tarball': e.resolved,
      'dist.integrity': e.integrity,
      license: e.license,
      ...(e.dependencies ? { dependencies: e.dependencies } : {}),
    };
  };

describe('lockfile check', () => {
  it('finds every dependency of the repository lockfile', () => {
    expect(missingDeps(real())).toEqual([]);
  });

  it('keeps the two emnapi entries in the repository lockfile, with version, tarball and integrity', () => {
    for (const key of [CORE, RUNTIME]) {
      const e = real().packages[key];
      expect(typeof e?.version).toBe('string');
      expect(typeof e?.resolved).toBe('string');
      expect(typeof e?.integrity).toBe('string');
    }
  });

  it('reports the two emnapi entries that npm on Windows drops', () => {
    const missing = missingDeps(stripped());
    const deps = missing.filter((m) => !m.peer);
    expect(deps.map((m) => m.name).sort()).toEqual(['@emnapi/core', '@emnapi/runtime']);
    expect(deps.every((m) => m.from === 'node_modules/@rolldown/binding-wasm32-wasi')).toBe(true);
    expect(missing.every((m) => m.at === `node_modules/${m.name}`)).toBe(true);
    // @napi-rs/wasm-runtime needs both as peers, in the same place.
    expect(missing.filter((m) => m.peer).map((m) => `${m.from} ${m.name}`)).toEqual([
      'node_modules/@napi-rs/wasm-runtime @emnapi/core',
      'node_modules/@napi-rs/wasm-runtime @emnapi/runtime',
    ]);
  });

  it('resolves like node: own node_modules first, then each parent, then the root', () => {
    const packages = {
      '': {},
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0' },
      'node_modules/b/node_modules/a': { version: '2.0.0' },
      'node_modules/b/node_modules/c': { version: '1.0.0' },
      'apps/x': {},
    };
    expect(resolveIn(packages, 'node_modules/b/node_modules/c', 'a')).toBe('node_modules/b/node_modules/a');
    expect(resolveIn(packages, 'node_modules/b', 'a')).toBe('node_modules/b/node_modules/a');
    expect(resolveIn(packages, 'apps/x', 'a')).toBe('node_modules/a');
    expect(resolveIn(packages, '', 'zz')).toBeNull();
  });

  it('keeps the exact key order of the repository lockfile', () => {
    const lock = real();
    expect(Object.keys(withEntries(lock, {}).packages)).toEqual(Object.keys(lock.packages));
  });

  it('writes the repository lockfile back byte for byte', () => {
    expect(serializeLock(real())).toBe(raw());
  });

  it('builds an entry exactly like the one npm wrote', () => {
    const e = entryFrom(viewFromFixture('@emnapi/core@2.0.0-beta.2'), true, true);
    expect(JSON.stringify(e)).toBe(JSON.stringify(fixture['@emnapi/core']));
  });

  it('takes the highest version when npm view returns a list for a range', () => {
    const e = entryFrom(
      [
        { version: '1.0.0', 'dist.tarball': 'https://r/x-1.0.0.tgz', 'dist.integrity': 'sha512-a', license: 'MIT' },
        { version: '1.2.0', 'dist.tarball': 'https://r/x-1.2.0.tgz', 'dist.integrity': 'sha512-b', license: 'MIT' },
      ],
      false,
      false,
    );
    expect(e).toEqual({ version: '1.2.0', resolved: 'https://r/x-1.2.0.tgz', integrity: 'sha512-b', license: 'MIT' });
  });

  it('lists dependencies sorted like npm, whatever order npm view prints them in', () => {
    const e = entryFrom(
      {
        version: '1.0.0',
        'dist.tarball': 'https://r/x.tgz',
        'dist.integrity': 'sha512-a',
        dependencies: { tslib: '^2.4.0', '@emnapi/wasi-threads': '2.2.0' },
      },
      false,
      false,
    );
    expect(Object.keys(e.dependencies ?? {})).toEqual(['@emnapi/wasi-threads', 'tslib']);
  });

  it('refuses an npm view answer without a tarball or integrity', () => {
    expect(() => entryFrom({ version: '1.0.0' }, false, false)).toThrow(/tarball|integrity/);
  });

  it('restores the stripped lockfile: same key order, entries as npm wrote them', () => {
    const r = fixLock(stripped(), viewFromFixture);
    expect(r.missing).toEqual([]);
    expect(r.added.sort()).toEqual([CORE, RUNTIME]);
    expect(Object.keys(r.lock.packages)).toEqual(Object.keys(real().packages));
    expect(JSON.stringify(r.lock.packages[CORE])).toBe(JSON.stringify(fixture['@emnapi/core']));
    expect(JSON.stringify(r.lock.packages[RUNTIME])).toBe(JSON.stringify(fixture['@emnapi/runtime']));
  });
});

describe('lockfile check: versions, bundles and peers', () => {
  it('reports a nested entry that npm on Windows drops, though a copy of another version still resolves', () => {
    expect(missingDeps(without(SHARP_RUNTIME))).toEqual([
      {
        name: '@emnapi/runtime',
        range: '^1.11.3',
        from: 'node_modules/@img/sharp-wasm32',
        at: SHARP_RUNTIME,
        found: 'node_modules/@emnapi/runtime@2.0.0-beta.2',
      },
    ]);
  });

  it('restores that nested entry where it was, as npm wrote it', () => {
    const r = fixLock(without(SHARP_RUNTIME), viewOf({ '@emnapi/runtime@^1.11.3': real().packages[SHARP_RUNTIME] }));
    expect(r.added).toEqual([SHARP_RUNTIME]);
    expect(r.missing).toEqual([]);
    expect(serializeLock(r.lock)).toBe(raw());
  });

  it("looks for a bundled dependency only in its bundler's node_modules, and never fills it from npm view", () => {
    const lock = without(OXIDE_CORE, OXIDE_RUNTIME);
    expect(missingDeps(lock)).toEqual([
      { name: '@emnapi/core', range: '^1.11.3', from: OXIDE, at: OXIDE_CORE, bundled: true },
      { name: '@emnapi/runtime', range: '^1.11.3', from: OXIDE, at: OXIDE_RUNTIME, bundled: true },
    ]);
    // Its version is the one inside the tarball of the bundler, which npm view cannot tell.
    const r = fixLock(lock, viewOf({}));
    expect(r.added).toEqual([]);
    expect(r.missing.map((m) => m.at)).toEqual([OXIDE_CORE, OXIDE_RUNTIME]);
  });

  it('restores what npm view cannot tell from the last committed lockfile, entry for entry', () => {
    const r = fixLock(without(OXIDE_CORE, OXIDE_RUNTIME), viewOf({}), { previous: real() });
    expect(r.added).toEqual([OXIDE_CORE, OXIDE_RUNTIME]);
    expect(r.missing).toEqual([]);
    expect(serializeLock(r.lock)).toBe(raw());
  });

  it('repairs the drop npm on Windows made on 24 Nov: the top-level emnapi entries and the two in the bundle', () => {
    const dropped = () => without(CORE, RUNTIME, OXIDE_CORE, OXIDE_RUNTIME);
    const answers = {
      '@emnapi/core@2.0.0-beta.2': fixture['@emnapi/core'],
      '@emnapi/runtime@2.0.0-beta.2': fixture['@emnapi/runtime'],
    };
    // Rolldown pins 2.0.0-beta.2 at the top level; the bundle's ^1.11.3 must not take that place.
    const bare = fixLock(dropped(), viewOf(answers));
    expect(bare.lock.packages[CORE]?.version).toBe('2.0.0-beta.2');
    expect(bare.lock.packages[RUNTIME]?.version).toBe('2.0.0-beta.2');
    expect(bare.missing.map((m) => m.at)).toEqual([OXIDE_CORE, OXIDE_RUNTIME]);
    const full = fixLock(dropped(), viewOf(answers), { previous: real() });
    expect(full.missing).toEqual([]);
    expect(serializeLock(full.lock)).toBe(raw());
  });

  it('checks required peers like npm, and skips optional ones', () => {
    const lock: Lockfile = {
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { a: '1.0.0', p: '2.0.0' } },
        'node_modules/a': {
          version: '1.0.0',
          peerDependencies: { p: '^1.0.0', q: '^1.0.0', r: '^1.0.0' },
          peerDependenciesMeta: { q: { optional: true } },
        },
        'node_modules/p': { version: '2.0.0' },
      },
    };
    // A peer lives next to the package that needs it, not inside it.
    expect(missingDeps(lock)).toEqual([
      {
        name: 'p',
        range: '^1.0.0',
        from: 'node_modules/a',
        at: 'node_modules/p',
        found: 'node_modules/p@2.0.0',
        peer: true,
      },
      { name: 'r', range: '^1.0.0', from: 'node_modules/a', at: 'node_modules/r', peer: true },
    ]);
  });

  it('checks by version only what npm checks by version: ranges, not tags, aliases, files or git', () => {
    const lock: Lockfile = {
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: {
            a: '*',
            b: '',
            c: 'latest',
            d: 'npm:other@^9.0.0',
            e: 'file:../e',
            f: 'github:x/f',
            w: '^1.0.0',
          },
        },
        'node_modules/a': { version: '3.0.0-rc.1' },
        'node_modules/b': { version: '1.0.0' },
        'node_modules/c': { version: '1.0.0' },
        'node_modules/d': { version: '1.0.0' },
        'node_modules/e': { version: '1.0.0' },
        'node_modules/f': { version: '1.0.0' },
        'node_modules/w': { link: true, resolved: 'packages/w' },
        'packages/w': { version: '1.2.0' },
      },
    };
    expect(missingDeps(lock)).toEqual([]);
    // A workspace link has the version of the workspace it points to.
    lock.packages['packages/w'] = { version: '2.0.0' };
    expect(missingDeps(lock)).toEqual([
      { name: 'w', range: '^1.0.0', from: '', at: 'node_modules/w', found: 'node_modules/w@2.0.0' },
    ]);
  });
});

describe('assertSafeSpec', () => {
  it.each(['x@1" & calc & "', 'x@1 && calc', 'x@$(id)', 'a/..@1', '@a/../b@1'])('rejects %s', (spec) => {
    expect(() => assertSafeSpec(spec)).toThrow(/unsafe/);
  });

  it.each(['@emnapi/core@^1.4.3', 'tslib@>=2 <3', 'a@1.0.0 || 2.x'])('accepts %s', (spec) => {
    expect(assertSafeSpec(spec)).toBe(spec);
  });
});
