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
interface ServerJson {
  version?: string;
  packages?: { version?: string }[];
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
    const server = json<ServerJson>('server.json');
    expect(server.version).toBe(version);
    expect(server.packages?.[0]?.version).toBe(version);
    expect(p.mcpServers).toEqual({ atropyle: { command: 'npx', args: ['-y', `@atropyle/mcp@${version}`] } });
    expect(text('.claude-plugin/plugin.json')).not.toMatch(/\b(api[_-]?key|private[_-]?key|secret|token|password)\b/i);
  });

  it('ships both skills and no project-wide .mcp.json', () => {
    for (const skill of SKILL_NAMES) expect(existsSync(join(ROOT, 'skills', skill, 'SKILL.md')), skill).toBe(true);
    expect(existsSync(join(ROOT, '.mcp.json'))).toBe(false);
  });
});

/** Every npm script that AGENTS.md names, in code blocks and inline, that its package.json lacks. */
function missingScripts(md: string): string[] {
  const inline = [...md.matchAll(/`(npm run [\w:-]+[^`]*)`/g)].map((m) => m[1]);
  const missing: string[] = [];
  for (const c of [...commandsOf(md), ...inline].filter((x) => x.startsWith('npm run '))) {
    const m = /^npm run ([\w:-]+)(?:\s+(?:-w|--workspace)[ =](\S+))?/.exec(c);
    if (!m) throw new Error(`unparsable command: ${c}`);
    const [, script, workspace] = m;
    const pkg = workspace === undefined ? 'package.json' : `${workspace}/package.json`;
    if (!Object.keys(json<Pkg>(pkg).scripts ?? {}).includes(script)) {
      missing.push(workspace === undefined ? script : `${script} (${workspace})`);
    }
  }
  return missing;
}

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
    expect(commandsOf(agents).filter((c) => c.startsWith('npm run ')).length).toBeGreaterThan(5);
    expect(missingScripts(agents)).toEqual([]);
  });

  it('catches inline commands that name a missing script', () => {
    const bogus = `${agents}\nRun \`npm run no-such-script --workspace packages/cli\` and \`npm run nope -w packages/mcp\`.\n`;
    expect(missingScripts(bogus)).toEqual(['no-such-script (packages/cli)', 'nope (packages/mcp)']);
  });

  it('names only paths that exist', () => {
    // Private notes that are never in git, and a directory that later plans add.
    const notYet = new Set(['prompts/', 'reports/', 'research_notes/', 'external_research/', 'apps/']);
    const paths = [...agents.matchAll(/`([\w.-]+(?:\/[\w.-]+)*\/?)`/g)]
      .map((m) => m[1])
      .filter((p) => p.endsWith('/') || /\.\w+$/.test(p));
    expect(paths.length).toBeGreaterThan(8);
    for (const p of paths) if (!notYet.has(p)) expect(existsSync(join(ROOT, p)), p).toBe(true);
  });
});
