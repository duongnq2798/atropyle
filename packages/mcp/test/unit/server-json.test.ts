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
    const s = server();
    s.name = 'io.github.DuongNQ2798/atropyle';
    s.version = '0.2.0';
    s.repository.url = 'https://github.com/duongnq2798/atropyle.git';
    s.packages[0].identifier = 'atropyle';
    s.packages[0].version = 'latest';
    const issues = checkServerJson(s, pkg);
    for (const word of ['mcpName', 'namespace', 'version', 'repository.url', 'identifier', 'latest']) {
      expect(issues.join('\n')).toContain(word);
    }
  });

  it('limits the description to 100 characters', () => {
    const s = server();
    s.description = 'x'.repeat(101);
    expect(checkServerJson(s, pkg).join('\n')).toContain('description');
  });
});
