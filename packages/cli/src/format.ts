import {
  type CheckPlanOutput,
  type GetVaultOutput,
  iso,
  type ListVaultsOutput,
  OKX_NOTE,
  type PrepareOutput,
  type SimulateOutput,
  type VerifyOutput,
} from '@atropyle/mcp/ops';
import { formatDuration } from '@atropyle/sdk';
import { formatUnits } from 'viem';
import { untrustedLines } from './output';
import type { PlanInitOutput } from './schemas';
import type { Style } from './style';

type Timeline = GetVaultOutput['timeline'];
type Warning = GetVaultOutput['warnings'][number];

/** A decimal unix-seconds string from JSON output, as ISO 8601. */
const when = (t: string | null): string => (t === null ? '-' : (iso(BigInt(t)) ?? '-'));

const warningLines = (ws: readonly Warning[], s: Style): string[] =>
  ws.map((w) => s.yellow(`warning ${w.code}: ${w.message}`));

function timelineLines(t: Timeline): string[] {
  if (t.events.length === 0) return ['  nothing happens before the end of the preview'];
  return t.events.map((e) => `  ${when(e.at)}  ${e.kind.padEnd(11)} ${e.from} -> ${e.state}  ${e.note}`);
}

const amount = (raw: string, decimals: number | null) => (decimals === null ? raw : formatUnits(BigInt(raw), decimals));

export function formatStatus(o: GetVaultOutput, s: Style): string {
  const st = o.status;
  const c = o.config;
  const lines = [
    `${s.bold(`Vault ${o.vault}${c.drill ? ' (Drill)' : ''}`)}  ${s.dim(`chain ${o.chainId}, block ${o.blockNumber}`)}`,
    `State      ${s.bold(st.state)}${st.pending !== st.state ? ` (due: ${st.pending})` : ''}`,
    ...o.explanation.map((l) => `  ${l}`),
    `Owner      ${c.owner}`,
    `Heirs      ${c.heirs.map((h, i) => `[${i}] ${h.account} ${h.bps / 100}%`).join(', ')}`,
    `Guardians  ${c.guardians.length === 0 ? 'none' : `${c.guardians.join(', ')} (k = ${c.k}, recovery ${c.recoveryEnabled ? 'on' : 'off'})`}`,
    `Timing     check in every ${formatDuration(c.timing.period)}; alarm after ${c.timing.threshold} missed; ${formatDuration(c.timing.window)} to cancel`,
  ];
  const next = o.timeline.nextCheckAt;
  if (next !== null) {
    const left = BigInt(next) - BigInt(st.blockTimestamp);
    lines.push(`Next       ${when(next)} (in ${formatDuration(left > 0n ? left : 0n)})`);
  }
  if (o.roles !== null) lines.push(`Roles      ${o.as}: ${o.roles.length > 0 ? o.roles.join(', ') : 'none'}`);
  lines.push(o.untrusted.texts.length > 0 ? 'Assets (names are in the block at the end)' : 'Assets');
  if (st.assets.length === 0) lines.push('  none');
  st.assets.forEach((a, i) => {
    const d = a.token.decimals;
    const held = BigInt(a.held);
    const erc20 = a.asset.kind === 'erc20';
    const pct = erc20 && held > 0n ? ` (${(BigInt(a.coverage) * 100n) / held}%)` : '';
    const nft = erc20 ? '' : ` #${a.asset.id} -> heir ${a.asset.heir}`;
    lines.push(
      `  [${i}] ${a.asset.kind} ${a.asset.token}${nft}  held ${amount(a.held, d)}  approved ${amount(a.coverage, d)}${pct}`,
    );
  });
  lines.push('Timeline if nobody acts', ...timelineLines(o.timeline));
  lines.push(...warningLines(o.warnings, s), '', o.summary, ...untrustedLines(o.untrusted), '');
  return lines.join('\n');
}

export function formatVaults(o: ListVaultsOutput, _s: Style): string {
  const lines = [o.summary];
  for (const v of o.vaults) {
    lines.push(
      `  ${v.vault}  ${v.state.padEnd(15)} ${v.roles.join(', ')}${v.drill ? '  (Drill)' : ''}  owner ${v.owner}`,
    );
  }
  return [...lines, ...untrustedLines(o.untrusted), ''].join('\n');
}

export function formatSimulate(o: SimulateOutput, s: Style): string {
  const lines = [s.bold(o.summary)];
  if (o.mode === 'action') {
    if (o.effect) {
      lines.push(
        `At         ${when(o.effect.at)} (${o.effect.engine})`,
        `State      ${o.effect.from} -> ${o.effect.next}`,
      );
      if (o.effect.drillExpired) {
        lines.push('The Drill will have expired by then, so it can no longer release anything.');
      }
      for (const r of o.effect.recipients) {
        lines.push(`  pays ${r.amount} (base units) of ${r.kind} ${r.token} to ${r.to}`);
      }
    }
    const sim = o.simulation;
    if (sim) {
      const text =
        sim.ok === true
          ? s.green(`ok, gas ${sim.gas}`)
          : sim.ok === false
            ? s.red(`reverts with ${sim.error.code}`)
            : `skipped (${sim.reason})`;
      lines.push(`Simulation ${text}`);
    }
  } else if (o.timeline) {
    lines.push('Timeline if the owner never checks in', ...timelineLines(o.timeline));
  }
  lines.push(...warningLines(o.warnings, s), ...untrustedLines(o.untrusted), '');
  return lines.join('\n');
}

const issueLines = (issues: readonly { path: string; code: string; message: string }[], s: Style) =>
  issues.map((i) => `  ${s.red(i.code.padEnd(18))} ${i.path}: ${i.message}`);

export function formatPlanCheck(o: CheckPlanOutput, s: Style): string {
  const lines = [o.ok ? s.green(s.bold(o.summary)) : s.red(s.bold(o.summary)), ...issueLines(o.issues, s)];
  if (o.tokens.length > 0) lines.push('Tokens (names are in the block at the end)');
  for (const t of o.tokens) {
    const d = t.info?.decimals ?? null;
    const kind = t.isContract ? 'contract' : s.red('NOT A CONTRACT');
    lines.push(
      `  [${t.index}] ${t.kind} ${t.token}  ${kind}  decimals ${d ?? '-'}  owner holds ${t.held === null ? '-' : amount(t.held, d)}`,
    );
  }
  const fees = o.fees.tokens.map((f) => `${amount(f.fee, f.decimals)} of ${f.token}`);
  const early = BigInt(o.fees.earlyRemaining) > 0n ? ` (early price for ${o.fees.earlyRemaining} more vaults)` : '';
  lines.push(`Fee now    ${fees.length > 0 ? fees.join(', or ') : 'none'}${early}`);
  if (o.contractHeirs.length > 0) {
    lines.push(
      s.yellow(`Heirs that are contracts: ${o.contractHeirs.join(', ')}. Make sure they can receive tokens and NFTs.`),
    );
  }
  lines.push(...warningLines(o.warnings, s), ...untrustedLines(o.untrusted), '');
  return lines.join('\n');
}

export function formatPlanInit(o: PlanInitOutput, s: Style): string {
  const lines = [o.ok ? s.green(o.summary) : s.red(o.summary), ...issueLines(o.issues, s)];
  if (o.next.length > 0) lines.push('', 'Next:', ...o.next.map((c) => `  ${c}`));
  lines.push(...warningLines(o.warnings, s), '');
  return lines.join('\n');
}

type Step = PrepareOutput['plan']['steps'][number];

function stepLines(steps: readonly Step[], s: Style): string[] {
  return steps.flatMap((st, i) => {
    const sim = st.simulation;
    const result =
      sim.ok === true
        ? s.green('simulated ok')
        : sim.ok === false
          ? s.red(`FAILS with ${sim.error.code}`)
          : `not simulated (${sim.reason})`;
    return [`  ${i + 1}. ${st.action} -> ${st.to}  ${result}`, `     ${st.summary}`];
  });
}

/** Summary, steps, warnings and notes come first; the signing link only after them (spec §7.1). */
function headOf(o: PrepareOutput, s: Style, okxNote = false): string[] {
  const lines = [s.bold(o.summary), ...stepLines(o.plan.steps, s)];
  if (o.warnings.length > 0) {
    lines.push(
      '',
      s.yellow(s.bold('Read before signing:')),
      ...o.warnings.map((w) => s.yellow(`  ${w.code}: ${w.message}`)),
    );
  }
  // The OKX note describes onchainos commands: human output shows it only where they are printed (--format okx).
  const notes = (o.handoff?.notes ?? []).filter((n) => okxNote || n !== OKX_NOTE);
  if (notes.length > 0) lines.push('', ...notes.map((n) => s.dim(n)));
  if (o.blocked) {
    const b = o.blocked;
    lines.push(
      '',
      s.red(`Nothing to sign: step ${b.step + 1} (${b.action}) fails with ${b.error.code}. ${b.error.hint}`),
    );
  }
  return lines;
}

export function formatPrepare(o: PrepareOutput, s: Style, qr: string | null, qrNote: string | null): string {
  const lines = headOf(o, s);
  const h = o.handoff;
  if (h?.link) {
    lines.push('', s.bold('Open this link in your wallet, check every step, and sign there:'), h.link);
    if (qr) lines.push('', qr);
    else if (qrNote) lines.push(s.dim(qrNote));
    if (h.okxAppLink) lines.push('', 'Open in the OKX App:', h.okxAppLink);
  } else if (h) {
    // Only the formats that print something: okx is null when a step sends native value.
    const formats = [...(h.cast.length > 0 ? ['cast'] : []), 'calls', ...(h.okx === null ? [] : ['okx'])].map(
      (f) => `--format ${f}`,
    );
    const last = formats.pop();
    lines.push('', `Use ${formats.length > 0 ? `${formats.join(', ')} or ` : ''}${last}.`);
  }
  lines.push('', s.dim('Atropyle never asks for your private key or seed phrase.'), ...untrustedLines(o.untrusted), '');
  return lines.join('\n');
}

/** stderr of --format cast, calls and okx, so that stdout stays machine-readable. */
export function briefPrepare(o: PrepareOutput, s: Style, okxNote = false): string {
  return [...headOf(o, s, okxNote), ...untrustedLines(o.untrusted), ''].join('\n');
}

const yes = (b: boolean) => (b ? 'yes' : 'NO');

export function formatVerify(o: VerifyOutput, s: Style): string {
  const at = o.blockNumber === null ? '' : ` at block ${o.blockNumber}`;
  const lines = [
    s.bold(`atropyle verify on chain ${o.chainId}${at}`),
    `RPC operators (${o.rpcs}): ${o.operators.map((g) => g.join(', ')).join(' | ')}`,
  ];
  const p = o.policy;
  if (p) {
    lines.push('', 'Property  Result  Violations');
    for (const [name, r] of Object.entries(p.properties)) {
      // A property that never ran (an RPC or netlist failure) is { ok: false, violations: 0 }: not a violation.
      const result = r.ok ? s.green('holds ') : r.violations === 0 ? s.yellow('not run') : s.red('FAILS ');
      lines.push(`${name.padEnd(9)} ${result} ${r.violations}`);
    }
    lines.push('', 'Netlists');
    for (const n of p.netlists) {
      const dep = n.matchesDeployment === null ? '-' : yes(n.matchesDeployment);
      lines.push(`  ${n.role.padEnd(7)} id ${n.id}  ${n.gates} gates  keccak ${n.keccak}`);
      lines.push(`          matches source: ${yes(n.matchesSource)}  matches deployment: ${dep}`);
    }
    lines.push(
      `CPU ${p.cpu}, policy ${p.policyId}, beacon frozen: ${p.beaconFrozen === null ? 'unknown' : yes(p.beaconFrozen)}`,
    );
    lines.push(`Checked ${p.combos.toLocaleString('en-US')} combinations in ${(p.ms / 1000).toFixed(1)} s`);
    for (const i of p.issues) lines.push(s.red(`  issue: ${i}`));
    for (const f of p.firstFailures) lines.push(s.red(`  counterexample: ${JSON.stringify(f)}`));
  } else if (o.policyError) {
    const e = o.policyError;
    lines.push('', s.red(`Policy not proven: ${e.code}: ${e.message}`), `  ${e.hint}`);
  } else {
    lines.push('', 'Policy proof skipped (--no-policy).');
  }
  if (o.vault) {
    const v = o.vault;
    lines.push('', s.bold(`Vault ${v.address}: ${v.ok ? s.green('ok') : s.red('FAILED')} (${v.state})`));
    for (const c of v.checks) {
      lines.push(
        `  ${c.ok ? s.green('ok  ') : s.red('FAIL')} ${c.name}${c.ok ? '' : `  expected ${c.expected ?? '-'}, got ${c.actual ?? '-'}`}`,
      );
    }
    if (v.unchanged !== null) lines.push(`  runs the proven policy: ${yes(v.unchanged)}`);
  }
  lines.push(
    ...warningLines(o.warnings, s),
    '',
    o.ok ? s.green(o.summary) : s.red(o.summary),
    ...untrustedLines(o.untrusted),
    '',
  );
  return lines.join('\n');
}
