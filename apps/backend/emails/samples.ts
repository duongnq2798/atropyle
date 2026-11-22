import type { Address, Hex } from 'viem';
import type { ComposeConfig, ComposeInput, Facts } from '../src/email/compose';
import type { EmailKind } from '../src/email/kinds';
import type { Lang, Role } from '../src/types';

/** Sample inputs for the snapshot tests and `npm run emails:preview`. Nothing here is real. */
export const SAMPLE_CONFIG: ComposeConfig = {
  siteUrl: 'https://atropyle.test',
  siteHost: 'atropyle.test',
  apiUrl: 'https://ref.supabase.co/functions/v1',
  mailFrom: 'Atropyle <alerts@atropyle.test>',
};
export const SAMPLE_VAULT: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const SAMPLE_HEIR: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
export const SAMPLE_GUARDIAN: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
export const SAMPLE_TARGET: Address = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
export const SAMPLE_TOKEN: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
export const SAMPLE_TX: Hex = `0x${'ab12'.repeat(16)}`;
/** 43 characters, the shape of a real token (TOKEN_RE). */
export const SAMPLE_UNSUB = 'sample-token-0123456789-abcdefghijklmnopqrs';
export const SAMPLE_CONFIRM = 'confirm-token-0123456789-abcdefghijklmnopqr';

const ROLE: Record<EmailKind, Role> = {
  confirm: 'owner',
  welcome: 'heir',
  'checkin-50': 'owner',
  'checkin-80': 'owner',
  'checkin-due': 'owner',
  'alarm-owner': 'owner',
  'alarm-guardian': 'guardian',
  'alarm-heir': 'heir',
  'recovery-vote': 'owner',
  released: 'heir',
  distributed: 'heir',
  'drill-summary': 'owner',
};

const FACTS: Record<EmailKind, Facts> = {
  confirm: {},
  welcome: {},
  'checkin-50': { deadline: 1795442700n },
  'checkin-80': { deadline: 1795442700n },
  'checkin-due': { deadline: 1795442700n },
  'alarm-owner': { deadline: 1795599000n, alarm: 'inheritance' },
  'alarm-guardian': { deadline: 1795599000n, alarm: 'inheritance' },
  'alarm-heir': { deadline: 1795599000n, alarm: 'inheritance' },
  'recovery-vote': { guardian: SAMPLE_GUARDIAN, target: SAMPLE_TARGET },
  released: { tx: SAMPLE_TX, released: 'inheritance' },
  distributed: {
    tx: SAMPLE_TX,
    transfers: [
      { kind: 'erc20', token: SAMPLE_TOKEN, to: SAMPLE_HEIR, amount: '10000', id: null },
      { kind: 'erc721', token: SAMPLE_TOKEN, to: SAMPLE_HEIR, amount: null, id: '42' },
    ],
  },
  'drill-summary': { checkIns: 3, alarms: 1, released: null },
};

export function sampleInput(kind: EmailKind, lang: Lang): ComposeInput {
  return {
    kind,
    lang,
    to: 'reader@example.com',
    vault: SAMPLE_VAULT,
    role: ROLE[kind],
    unsubToken: SAMPLE_UNSUB,
    confirmToken: kind === 'confirm' ? SAMPLE_CONFIRM : undefined,
    facts: FACTS[kind],
    idempotencyKey: `sample-${kind}-${lang}`,
  };
}
