#!/usr/bin/env node
// Drives the Atropyle MCP server the way an agent does: check_plan, simulate, prepare_create_vault.
// It never signs. It prints a signing link for the owner's own wallet.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export const SERVER_PACKAGE = '@atropyle/mcp@0.1.0';
const LOCAL_BIN = fileURLToPath(new URL('../../packages/mcp/dist/bin.js', import.meta.url));

const USAGE = `Usage: node index.mjs --owner <address> --heir <address[:percent]> [--heir ...] [--real] [--local] [--deployment <file>]

Plans an Atropyle vault through the MCP server: check_plan, simulate, prepare_create_vault.
Prints a signing link for the owner's wallet. Never signs.

  --real               a real vault (six months) instead of a Drill
  --local              run packages/mcp/dist/bin.js from this repository instead of npx
  --deployment <file>  a deployment JSON, such as deployments/local.json of npm run devnet`;

/** A plan document. Heirs are "address[:percent]"; without any percent, shares are equal. */
export function planOf({ owner, heirs, drill }) {
  const parsed = heirs.map((h) => {
    const [account, percent] = h.split(':');
    return percent === undefined ? { account } : { account, percent: Number(percent) };
  });
  const equal = parsed.length > 1 && parsed.every((h) => h.percent === undefined);
  return {
    version: 1,
    owner,
    drill,
    heirs: equal ? parsed.map((h) => ({ ...h, percent: 100 / parsed.length })) : parsed,
    timing: drill ? 'drill' : 'sixMonths',
  };
}

export async function connect({ command, args, env }) {
  const client = new Client(
    { name: 'atropyle-example-agent', version: '0.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  await client.connect(new StdioClientTransport({ command, args, ...(env ? { env } : {}) }));
  return client;
}

/**
 * Calls a tool and returns its structuredContent. A tool error becomes an exception: the server sends no
 * structuredContent with isError, so the error envelope is read from the second text block.
 */
export async function call(client, name, args) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) {
    let error;
    try {
      error = JSON.parse(r.content?.[1]?.text ?? '').error;
    } catch {
      // Not an envelope: fall back to the first text block below.
    }
    throw new Error(`${name}: ${error?.code ?? 'ERROR'}: ${error?.message ?? r.content?.[0]?.text ?? 'failed'}`);
  }
  return r.structuredContent;
}

const when = (at) => new Date(Number(at) * 1000).toISOString();

export async function run({ command, args, env, owner, heirs, drill = true, log = console.log }) {
  const client = await connect({ command, args, env });
  try {
    log(`Tools: ${(await client.listTools()).tools.map((t) => t.name).join(', ')}`);
    const plan = planOf({ owner, heirs, drill });

    const check = await call(client, 'atropyle_check_plan', { plan, drill });
    log(`check_plan: ${check.summary}`);
    if (!check.ok) {
      for (const i of check.issues) log(`  ${i.path}: ${i.message}`);
      return { check, simulate: null, prepare: null };
    }

    const simulate = await call(client, 'atropyle_simulate', { plan, drill });
    log(`simulate: ${simulate.summary}`);
    for (const e of simulate.timeline?.events ?? []) log(`  ${when(e.at)}  ${e.kind}: ${e.from} -> ${e.state}`);

    const prepare = await call(client, 'atropyle_prepare_create_vault', { plan, drill });
    // The summary and every warning come before the link, so nobody signs without reading them.
    log(`prepare_create_vault: ${prepare.summary}`);
    for (const [i, s] of prepare.plan.steps.entries()) log(`  ${i + 1}. ${s.summary}`);
    for (const w of prepare.warnings) log(`  warning ${w.code}: ${w.message}`);
    if (prepare.handoff?.link) {
      log(`Open this link in your wallet, check each step there, then sign:\n${prepare.handoff.link}`);
    } else if (prepare.blocked) {
      log(`Nothing to sign: step ${prepare.blocked.step + 1} fails with ${prepare.blocked.error.code}.`);
    } else {
      log('Nothing to do: the plan needs no transactions.');
    }
    return { check, simulate, prepare };
  } finally {
    await client.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      owner: { type: 'string' },
      heir: { type: 'string', multiple: true },
      real: { type: 'boolean', default: false },
      local: { type: 'boolean', default: false },
      deployment: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || values.owner === undefined || values.heir === undefined) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 2;
    return;
  }
  const server = values.local
    ? { command: process.execPath, args: [LOCAL_BIN] }
    : { command: 'npx', args: ['-y', SERVER_PACKAGE] };
  if (values.deployment !== undefined) server.args.push('--deployment', values.deployment);
  const out = await run({ ...server, owner: values.owner, heirs: values.heir, drill: !values.real });
  // Exit 1 when the plan has issues or a step is blocked; a plan with nothing to do is not an error.
  process.exitCode = out.prepare === null || out.prepare.blocked ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
