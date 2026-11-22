import type { Tone } from './theme';

/** Spec §9.4: the twelve templates. */
export const EMAIL_KINDS = [
  'confirm',
  'welcome',
  'checkin-50',
  'checkin-80',
  'checkin-due',
  'alarm-owner',
  'alarm-guardian',
  'alarm-heir',
  'recovery-vote',
  'released',
  'distributed',
  'drill-summary',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** The thread at the top of the card: steady while time runs, frayed when action is needed, split once released. */
export type ThreadShape = 'steady' | 'frayed' | 'split';

export const THREAD: Record<EmailKind, { tone: Tone; progress: number; shape: ThreadShape }> = {
  confirm: { tone: 'thread', progress: 12, shape: 'steady' },
  welcome: { tone: 'alive', progress: 100, shape: 'steady' },
  'checkin-50': { tone: 'alive', progress: 50, shape: 'steady' },
  'checkin-80': { tone: 'grace', progress: 80, shape: 'steady' },
  'checkin-due': { tone: 'grace', progress: 100, shape: 'frayed' },
  'alarm-owner': { tone: 'danger', progress: 100, shape: 'frayed' },
  'alarm-guardian': { tone: 'grace', progress: 100, shape: 'frayed' },
  'alarm-heir': { tone: 'grace', progress: 100, shape: 'frayed' },
  'recovery-vote': { tone: 'recovery', progress: 60, shape: 'frayed' },
  released: { tone: 'release', progress: 100, shape: 'split' },
  distributed: { tone: 'release', progress: 100, shape: 'split' },
  'drill-summary': { tone: 'thread', progress: 100, shape: 'steady' },
};

export const FACT_NAMES = ['deadline', 'guardian', 'target', 'tx', 'checkIns', 'alarms'] as const;
export type FactName = (typeof FACT_NAMES)[number];

/** Labelled facts each email shows above its button. */
export const FACTS: Record<EmailKind, readonly FactName[]> = {
  confirm: [],
  welcome: [],
  'checkin-50': ['deadline'],
  'checkin-80': ['deadline'],
  'checkin-due': ['deadline'],
  'alarm-owner': ['deadline'],
  'alarm-guardian': ['deadline'],
  'alarm-heir': ['deadline'],
  'recovery-vote': ['guardian', 'target'],
  released: ['tx'],
  distributed: ['tx'],
  'drill-summary': ['checkIns', 'alarms'],
};

/** Facts printed in the monospace face (addresses and hashes). */
export const MONO_FACTS: ReadonlySet<FactName> = new Set(['guardian', 'target', 'tx']);

/** Every placeholder a template may use. {{name}} is HTML-escaped; {{{transfersHtml}}} is raw and HTML-only. */
export const PLACEHOLDERS = [
  'siteUrl',
  'siteHost',
  'vault',
  'vaultShort',
  'vaultGrouped',
  'roleLabel',
  'unsubscribeUrl',
  'actionUrl',
  'deadline',
  'reason',
  'guardian',
  'target',
  'tx',
  'txShort',
  'transfersHtml',
  'transfersText',
  'checkIns',
  'alarms',
  'outcome',
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
