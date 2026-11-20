import { assertRpcChain, errorJson, finish, operatorHosts } from '@atropyle/mcp/ops';
import { createAtropyle, type Deployment, decodeError, type IntegrityReport } from '@atropyle/sdk';
import type { Command } from 'commander';
import { deploymentFor, sdkOptionsFor } from '../client';
import { action, type Ctx } from '../context';
import { EXIT, exitCodeForCode } from '../exit';
import type { Globals } from '../globals';
import type { Io } from '../io';
import { emit, untrustedLines } from '../output';
import { type DoctorOutput, DoctorOutputSchema } from '../schemas';
import type { Style } from '../style';
import { VERSION } from '../version';

interface Target {
  role: 'read' | 'verify';
  operator: number | null;
  url: string;
}
type Rpc = DoctorOutput['rpcs'][number];

/** Every URL once: the read RPCs (or --rpc), then each operator of quorumRpcUrls. */
export function doctorTargets(g: Globals, d: Deployment): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  const add = (t: Target) => {
    if (seen.has(t.url)) return;
    seen.add(t.url);
    out.push(t);
  };
  for (const url of g.rpc ? [g.rpc] : d.rpcUrls) add({ role: 'read', operator: null, url });
  d.quorumRpcUrls.forEach((group, i) => {
    for (const url of group) add({ role: 'verify', operator: i + 1, url });
  });
  return out;
}

async function probe(t: Target, chainId: number, io: Io): Promise<Rpc> {
  const host = operatorHosts([[t.url]])[0][0];
  const started = performance.now();
  try {
    await assertRpcChain(t.url, chainId, { fetch: io.fetch });
    return {
      role: t.role,
      operator: t.operator,
      host,
      ok: true,
      chainId,
      latencyMs: Math.round(performance.now() - started),
      error: null,
    };
  } catch (e) {
    const err = decodeError(e);
    const error = err.code === 'WRONG_CHAIN' || err.code === 'RPC_RATE_LIMITED' ? err.code : 'RPC_UNAVAILABLE';
    const actual =
      err.code === 'WRONG_CHAIN' ? Number((err.details as { actual?: unknown } | undefined)?.actual) : null;
    return { role: t.role, operator: t.operator, host, ok: false, chainId: actual, latencyMs: null, error };
  }
}

function summarize(
  node: DoctorOutput['node'],
  rpcs: Rpc[],
  integrity: IntegrityReport | null,
  failed: string | null,
  chainId: number,
): string {
  const problems: string[] = [];
  if (!node.ok) problems.push(`Node.js ${node.version} is too old; Atropyle needs 20 or newer`);
  for (const r of rpcs) if (!r.ok) problems.push(`${r.role} RPC ${r.host} failed with ${r.error}`);
  if (failed) problems.push(`the integrity check failed with ${failed}`);
  else if (!integrity) problems.push('the integrity check was skipped because an RPC failed');
  else if (!integrity.ok)
    problems.push(
      `integrity FAILED on ${integrity.checks
        .filter((c) => !c.ok)
        .map((c) => c.name)
        .join(', ')}`,
    );
  if (problems.length > 0) return `${problems.length} problem(s): ${problems.join('; ')}.`;
  return `All good: Node.js ${node.version}, ${rpcs.length} RPC endpoint(s) on chain ${chainId}, integrity passed at block ${integrity?.blockNumber}.`;
}

async function doctor(g: Globals, io: Io): Promise<DoctorOutput> {
  const d = await deploymentFor(g, io);
  const major = Number(io.nodeVersion.replace(/^v/, '').split('.')[0]);
  const node = { version: io.nodeVersion, required: '>=20' as const, ok: major >= 20 };
  const rpcs = await Promise.all(doctorTargets(g, d).map((t) => probe(t, d.chainId, io)));
  let integrity: IntegrityReport | null = null;
  let integrityError: ReturnType<typeof errorJson> | null = null;
  // With an RPC down the integrity check can only fail after a slow quorum retry; the exit code is 4 either way.
  if (rpcs.every((r) => r.ok)) {
    try {
      integrity = await createAtropyle(await sdkOptionsFor(g, io, { checkRpc: false, deployment: d })).integrity();
    } catch (e) {
      integrityError = errorJson(e);
    }
  }
  const ok = node.ok && rpcs.every((r) => r.ok) && integrity?.ok === true;
  return finish(DoctorOutputSchema, {
    ok,
    cli: VERSION,
    node,
    deployment: d.name,
    chainId: d.chainId,
    rpcs,
    integrity,
    integrityError,
    summary: summarize(node, rpcs, integrity, integrityError?.code ?? null, d.chainId),
    warnings: integrity?.warnings ?? [],
  });
}

export function doctorExitCode(o: DoctorOutput): number {
  if (o.rpcs.some((r) => !r.ok)) return EXIT.network;
  if (o.integrityError) return exitCodeForCode(o.integrityError.code, 'doctor');
  if (o.integrity && !o.integrity.ok) return EXIT.verification;
  if (!o.node.ok) return EXIT.error;
  return EXIT.ok;
}

function formatDoctor(o: DoctorOutput, s: Style): string {
  const mark = (ok: boolean) => (ok ? s.green('ok  ') : s.red('FAIL'));
  const lines = [s.bold(`atropyle doctor (CLI ${o.cli}, deployment ${o.deployment}, chain ${o.chainId})`)];
  lines.push(`${mark(o.node.ok)} Node.js ${o.node.version} (needs ${o.node.required})`);
  for (const r of o.rpcs) {
    const who = r.role === 'read' ? 'read RPC' : `verify RPC #${r.operator}`;
    lines.push(`${mark(r.ok)} ${who} ${r.host} ${r.ok ? `chain ${r.chainId}, ${r.latencyMs} ms` : r.error}`);
  }
  if (o.integrity) {
    const passed = o.integrity.checks.filter((c) => c.ok).length;
    lines.push(
      `${mark(o.integrity.ok)} integrity: ${passed} of ${o.integrity.checks.length} checks at block ${o.integrity.blockNumber}`,
    );
  } else lines.push(`${s.yellow('SKIP')} integrity${o.integrityError ? `: ${o.integrityError.code}` : ''}`);
  for (const w of o.warnings) lines.push(s.yellow(`warning ${w.code}: ${w.message}`));
  lines.push('', o.summary, ...untrustedLines(o.untrusted), '');
  return lines.join('\n');
}

export function registerDoctor(program: Command, ctx: Ctx): void {
  program
    .command('doctor')
    .description('check Node.js, every RPC, the chain ID, latency and the deployment integrity')
    .action(
      action(ctx, 'doctor', async (g) => {
        const out = await doctor(g, ctx.io);
        emit(ctx, g, out, formatDoctor);
        return doctorExitCode(out);
      }),
    );
}
