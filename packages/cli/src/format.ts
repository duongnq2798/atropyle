import { type GetVaultOutput, iso, type ListVaultsOutput, type SimulateOutput } from '@atropyle/mcp/ops';
import { formatDuration } from '@atropyle/sdk';
import { formatUnits } from 'viem';
import { untrustedLines } from './output';
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
