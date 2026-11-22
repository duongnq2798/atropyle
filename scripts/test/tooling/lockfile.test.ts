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

function stripped(): Lockfile {
  const lock = real();
  delete lock.packages[CORE];
  delete lock.packages[RUNTIME];
  return lock;
}

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
    expect(missing.map((m) => m.name).sort()).toEqual(['@emnapi/core', '@emnapi/runtime']);
    expect(missing.every((m) => m.from === 'node_modules/@rolldown/binding-wasm32-wasi')).toBe(true);
    expect(missing.every((m) => m.at === `node_modules/${m.name}`)).toBe(true);
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

describe('assertSafeSpec', () => {
  it.each(['x@1" & calc & "', 'x@1 && calc', 'x@$(id)', 'a/..@1', '@a/../b@1'])('rejects %s', (spec) => {
    expect(() => assertSafeSpec(spec)).toThrow(/unsafe/);
  });

  it.each(['@emnapi/core@^1.4.3', 'tslib@>=2 <3', 'a@1.0.0 || 2.x'])('accepts %s', (spec) => {
    expect(assertSafeSpec(spec)).toBe(spec);
  });
});
