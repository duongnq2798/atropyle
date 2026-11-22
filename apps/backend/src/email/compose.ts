import { type Address, getAddress, type Hex } from 'viem';
import type { Config } from '../config';
import type { Lang, Role } from '../types';
import { COPY } from './copy';
import { fill } from './fill';
import { formatDeadline, groupAddress, shortHex, type Transfer, transferLines, transfersHtml } from './format';
import type { EmailKind } from './kinds';
import type { TemplateSet } from './template-types';
import { TEMPLATES } from './templates.gen';

/** What an email says beyond the vault and the role. Every value is chain data or a count, never free text. */
export interface Facts {
  /** Chain time: check-in deadline (reminders) or end of the alarm window (alarms). */
  deadline?: bigint;
  alarm?: 'inheritance' | 'recovery';
  guardian?: Address;
  target?: Address;
  tx?: Hex;
  transfers?: Transfer[];
  checkIns?: number;
  alarms?: number;
  /** released: how it was released. drill-summary: whether it ever was (null = never). */
  released?: 'inheritance' | 'recovery' | null;
}

export interface ComposeInput {
  kind: EmailKind;
  lang: Lang;
  to: string;
  vault: Address;
  role: Role;
  /** unsubToken(TOKEN_SECRET, subscription id): in the footer link and the List-Unsubscribe header. */
  unsubToken: string;
  /** The confirm email only: the raw token whose SHA-256 is subscriptions.confirm_hash. */
  confirmToken?: string;
  facts?: Facts;
  /** Resend Idempotency-Key: one per (subscription, kind, period). */
  idempotencyKey: string;
}

export interface Mail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
  idempotencyKey: string;
}

export type ComposeConfig = Pick<Config, 'siteUrl' | 'siteHost' | 'apiUrl' | 'mailFrom'>;

/**
 * The button of every email (spec §9.6 link formats). Tokens live in the URL fragment, never in a query string
 * sent to the site. The drill summary links to the vault page too: no email links to /create/.
 */
export function actionUrlOf(cfg: ComposeConfig, input: ComposeInput): string {
  if (input.kind === 'confirm') {
    if (!input.confirmToken) throw new Error('a confirm email needs its confirm token');
    return `${cfg.siteUrl}/alerts/confirm/#t=${input.confirmToken}`;
  }
  return `${cfg.siteUrl}/vault/#${getAddress(input.vault)}`;
}

export function unsubscribeUrlOf(cfg: ComposeConfig, token: string): string {
  return `${cfg.siteUrl}/alerts/unsubscribe/#t=${token}`;
}

function reasonOf(input: ComposeInput): string | undefined {
  const f = COPY[input.lang].fragments;
  const recovery = input.facts?.alarm === 'recovery';
  if (input.kind === 'alarm-owner') return recovery ? f.alarmOwnerRecovery : f.alarmOwnerInheritance;
  if (input.kind === 'alarm-guardian') return recovery ? f.alarmGuardianRecovery : f.alarmGuardianInheritance;
  return undefined;
}

function outcomeOf(input: ComposeInput): string | undefined {
  const f = COPY[input.lang].fragments;
  const released = input.facts?.released ?? null;
  if (input.kind === 'released') return released === 'recovery' ? f.releasedRecovery : f.releasedInheritance;
  if (input.kind === 'drill-summary') return released === null ? f.summaryNotReleased : f.summaryReleased;
  return undefined;
}

/** A ready-to-send email: the generated template filled in, plus the RFC 8058 one-click unsubscribe headers. */
export function composeEmail(cfg: ComposeConfig, input: ComposeInput, templates: TemplateSet = TEMPLATES): Mail {
  const t = templates[input.kind][input.lang];
  const f = input.facts ?? {};
  const vault = getAddress(input.vault);
  const vars: Record<string, string> = {
    siteUrl: cfg.siteUrl,
    siteHost: cfg.siteHost,
    vault,
    vaultShort: shortHex(vault),
    vaultGrouped: groupAddress(vault),
    roleLabel: COPY[input.lang].roles[input.role],
    unsubscribeUrl: unsubscribeUrlOf(cfg, input.unsubToken),
    actionUrl: actionUrlOf(cfg, input),
  };
  if (f.deadline !== undefined) vars.deadline = formatDeadline(f.deadline, input.lang);
  if (f.guardian) vars.guardian = getAddress(f.guardian);
  if (f.target) vars.target = getAddress(f.target);
  if (f.tx) {
    vars.tx = f.tx;
    vars.txShort = shortHex(f.tx, 10, 6);
  }
  if (f.transfers) {
    const lines = transferLines(f.transfers, input.lang);
    vars.transfersText = lines.join('\n');
    vars.transfersHtml = transfersHtml(lines);
  }
  if (f.checkIns !== undefined) vars.checkIns = String(f.checkIns);
  if (f.alarms !== undefined) vars.alarms = String(f.alarms);
  const reason = reasonOf(input);
  if (reason !== undefined) vars.reason = reason;
  const outcome = outcomeOf(input);
  if (outcome !== undefined) vars.outcome = outcome;

  return {
    from: cfg.mailFrom,
    to: input.to,
    subject: fill(t.subject, vars, 'text'),
    html: fill(t.html, vars, 'html'),
    text: fill(t.text, vars, 'text'),
    headers: {
      'List-Unsubscribe': `<${cfg.apiUrl}/unsubscribe?t=${input.unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'kind', value: input.kind }],
    idempotencyKey: input.idempotencyKey,
  };
}
