import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commandsOf, SKILL_NAMES } from '../skills-lib';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const text = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const json = <T>(p: string): T => JSON.parse(text(p)) as T;

interface Marketplace {
  name: string;
  owner: { name: string };
  plugins: { name: string; source: string }[];
}
interface Plugin {
  name: string;
  version: string;
  mcpServers: unknown;
}
interface Pkg {
  version?: string;
  scripts?: Record<string, string>;
}

describe('Claude Code plugin', () => {
  it('lists one plugin at the repository root', () => {
    const m = json<Marketplace>('.claude-plugin/marketplace.json');
    expect(m.name).toBe('atropyle');
    expect(m.owner.name).toBe('duongnq2798');
    expect(m.plugins).toEqual([expect.objectContaining({ name: 'atropyle', source: './' })]);
  });

  it('runs the MCP server pinned to the version of @atropyle/mcp', () => {
    const p = json<Plugin>('.claude-plugin/plugin.json');
    const version = json<Pkg>('packages/mcp/package.json').version;
    expect(p.name).toBe('atropyle');
    expect(p.version).toBe(version);
    expect(json<Pkg>('server.json').version).toBe(version);
    expect(p.mcpServers).toEqual({ atropyle: { command: 'npx', args: ['-y', `@atropyle/mcp@${version}`] } });
    expect(text('.claude-plugin/plugin.json')).not.toMatch(/\b(api[_-]?key|private[_-]?key|secret|token|password)\b/i);
  });

  it('ships both skills and no project-wide .mcp.json', () => {
    for (const skill of SKILL_NAMES) expect(existsSync(join(ROOT, 'skills', skill, 'SKILL.md')), skill).toBe(true);
    expect(existsSync(join(ROOT, '.mcp.json'))).toBe(false);
  });
});

describe('AGENTS.md', () => {
  const agents = text('AGENTS.md');

  it('states the zero-key rules', () => {
    for (const phrase of [
      'Never ask for, read or store a private key or seed phrase',
      'PRIVATE_KEY',
      'eth_sendTransaction',
      'No CI workflow signs a transaction',
      'untrusted',
      'Never `git add -A`',
    ]) {
      expect(agents).toContain(phrase);
    }
    expect(text('CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('names only npm scripts that exist', () => {
    const runs = commandsOf(agents).filter((c) => c.startsWith('npm run '));
    expect(runs.length).toBeGreaterThan(5);
    for (const c of runs) {
      const m = /^npm run ([\w:-]+)(?: -w (\S+))?/.exec(c);
      expect(m, c).not.toBeNull();
      const [, script, workspace] = m as RegExpExecArray;
      const pkg = workspace === undefined ? 'package.json' : `${workspace}/package.json`;
      expect(Object.keys(json<Pkg>(pkg).scripts ?? {}), c).toContain(script);
    }
  });
});
