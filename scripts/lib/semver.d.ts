// semver ships no types, and @types/semver is not installed: the two functions scripts/lib/lockfile.ts calls.
declare module 'semver' {
  /** `true` is the old shorthand for `{ loose: true }`, which npm itself passes. */
  type Options = boolean | { loose?: boolean; includePrerelease?: boolean };
  function satisfies(version: string, range: string, options?: Options): boolean;
  function validRange(range: string, options?: Options): string | null;
  const semver: { satisfies: typeof satisfies; validRange: typeof validRange };
  export default semver;
}
