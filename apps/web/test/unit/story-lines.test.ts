// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MCP_PACKAGE } from '../../src/content/commands';
import { HERO_HEIRS } from '../../src/home/impl/hero-states';
import { beatsOf, INHERIT_DAYS, STAGE_RUNS } from '../../src/home/sim-days';
import { AGENT_INSTALL, AGENT_LINES, AGENT_TOOLS, HEIR_SHARES } from '../../src/home/story-lines';
import { placeholders } from '../../src/i18n/core';
import { messages as story } from '../../src/messages/story.messages';

const tools = readFileSync(new URL('../../../../packages/mcp/src/tools.ts', import.meta.url), 'utf8');

describe('the story after the stage', () => {
  it('names only tools the MCP server has, in the order an agent calls them', () => {
    for (const tool of AGENT_TOOLS) expect(tools).toContain(`name: '${tool}'`);
    expect(AGENT_LINES.flatMap((l) => (l.who === 'tool' ? [l.tool] : []))).toEqual([...AGENT_TOOLS]);
  });

  it('tells the shares and the days the stage computes, and types no number (spec §18.2, 3)', () => {
    expect(HEIR_SHARES).toEqual(HERO_HEIRS.map((h) => h.bps));
    expect(HEIR_SHARES.reduce((a, b) => a + b, 0)).toBe(10_000);
    const beats = beatsOf(STAGE_RUNS.confirm);
    expect(beats.find((b) => b.key === 'alarm')?.day).toBe(INHERIT_DAYS.alarm);
    expect(beats.find((b) => b.key === 'gate')?.day).toBe(INHERIT_DAYS.release);
    expect(placeholders(story.en.agentLine3)).toEqual(['alarm', 'gate']);
    for (const lang of ['en', 'vi'] as const) {
      for (const [key, text] of Object.entries(story[lang])) {
        expect(text.replace(/\{\w+\}/g, ''), `${lang}.${key}`).not.toMatch(/\d/);
      }
    }
  });

  it('installs the MCP server that is on npm, in Claude Code', () => {
    expect(AGENT_INSTALL).toBe(`claude mcp add atropyle -- npx -y ${MCP_PACKAGE}`);
  });
});
