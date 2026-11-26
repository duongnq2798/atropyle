import { COMMANDS } from '@/content/commands';

/** The MCP tools of the illustrated session, in the order an agent calls them (story-lines.test.ts reads tools.ts). */
export const AGENT_TOOLS = ['atropyle_check_plan', 'atropyle_simulate', 'atropyle_prepare_create_vault'] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];
export type AgentLineKey = 'agentLine1' | 'agentLine2' | 'agentLine3' | 'agentLine4';
export type AgentLine = { who: 'you' | 'agent'; key: AgentLineKey } | { who: 'tool'; tool: AgentTool };

/** A static transcript (spec §18.5 C8): a person's words, the tool calls, and the agent's answers. */
export const AGENT_LINES: readonly AgentLine[] = [
  { who: 'you', key: 'agentLine1' },
  { who: 'tool', tool: 'atropyle_check_plan' },
  { who: 'agent', key: 'agentLine2' },
  { who: 'tool', tool: 'atropyle_simulate' },
  { who: 'agent', key: 'agentLine3' },
  { who: 'tool', tool: 'atropyle_prepare_create_vault' },
  { who: 'agent', key: 'agentLine4' },
];

/**
 * The heirs' shares of the stories, in basis points: HERO_HEIRS of impl/hero-states.ts, which a server component
 * cannot import (it carries the SDK); story-lines.test.ts holds the two equal. The agent's words and the closing
 * scene's thread split by them (7C T7b splits that thread by the witness's real shares).
 */
export const HEIR_SHARES = [7_000, 3_000] as const;

/**
 * The one install command of the agent band (spec §18.5 C8): the MCP server published on npm, added to Claude Code.
 * /developers/ (7C T10) lists the others, each pinned to the SDK's VERSION.
 */
export const AGENT_INSTALL = `claude mcp add atropyle -- ${COMMANDS.mcp}`;
