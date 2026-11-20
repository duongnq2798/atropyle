import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkServerJson } from '../../scripts/validate-server-json';

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const server = () => read('../../../../server.json');
const pkg = read('../../package.json');

describe('server.json', () => {
  it('matches the npm package', () => {
    expect(checkServerJson(server(), pkg)).toEqual([]);
  });

  it('reports every mismatch', () => {
    const mutations: [string, (s: ReturnType<typeof server>) => void, string][] = [
      ['name', (s) => (s.name = 'io.github.DuongNQ2798/atropyle'), 'differs from mcpName'],
      ['namespace', (s) => (s.name = 'io.github.DuongNQ2798/atropyle'), 'name must be in the namespace'],
      ['top-level version', (s) => (s.version = '0.2.0'), 'version 0.2.0 differs from package.json 0.1.0'],
      ['repository.url', (s) => (s.repository.url = 'https://github.com/duongnq2798/atropyle.git'), 'repository.url'],
      ['identifier', (s) => (s.packages[0].identifier = 'atropyle'), 'identifier must be @atropyle/mcp'],
      ['latest', (s) => (s.packages[0].version = 'latest'), 'must not be latest'],
      ['package version', (s) => (s.packages[0].version = '0.2.0'), 'packages[0].version 0.2.0 differs from 0.1.0'],
    ];
    for (const [label, mutate, message] of mutations) {
      const s = server();
      mutate(s);
      expect(checkServerJson(s, pkg).join('\n'), label).toContain(message);
    }
    // A version regression alone is reported on its own, so it cannot hide behind another failure.
    const s = server();
    s.version = '0.2.0';
    expect(checkServerJson(s, pkg)).toEqual(['version 0.2.0 differs from package.json 0.1.0']);
  });

  it('limits the description to 100 characters', () => {
    const s = server();
    s.description = 'x'.repeat(101);
    expect(checkServerJson(s, pkg).join('\n')).toContain('description');
  });
});
