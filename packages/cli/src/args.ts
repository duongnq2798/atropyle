import { parseDuration, toAddress } from '@atropyle/sdk';
import type { Command } from 'commander';
import type { Address } from 'viem';
import { UsageError } from './exit';

export const collect = (value: string, previous: string[]): string[] => [...previous, value];

/** INVALID_ADDRESS (exit 2) when `value` is not an address; checksummed otherwise. */
export const addressArg = (value: string, name: string): Address => toAddress(value, name);

export function intArg(value: string, name: string): number {
  if (!/^\d+$/.test(value.trim())) throw new UsageError(`${name} must be a whole number.`);
  return Number(value);
}

export function durationArg(value: string, name: string): number {
  try {
    return parseDuration(value, name);
  } catch {
    throw new UsageError(`${name} must be a duration such as 45s, 90m, 12h, 3d or 2w.`);
  }
}

export interface ActionFlags {
  heir: string[];
  guardian: string[];
  k?: string;
  recovery?: boolean;
  timing?: string;
  period?: string;
  threshold?: string;
  window?: string;
  asset: string[];
  off?: boolean;
  target?: string;
  withdraw?: boolean;
}

const ACTION_FLAG_KEYS = [
  'heir',
  'guardian',
  'k',
  'recovery',
  'timing',
  'period',
  'threshold',
  'window',
  'asset',
  'off',
  'target',
  'withdraw',
] as const satisfies readonly (keyof ActionFlags)[];

export const givenFlags = (f: ActionFlags): (keyof ActionFlags)[] =>
  ACTION_FLAG_KEYS.filter((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined;
  });

/** The flags of every vault action. `simulate` and `prepare` share them. */
export function addActionOptions(cmd: Command): Command {
  return cmd
    .option('--heir <address[:percent]>', 'set-heirs: an heir and their share; repeat for each heir', collect, [])
    .option('--guardian <address>', 'set-guardians: a guardian; repeat for each', collect, [])
    .option('--k <n>', 'set-guardians: how many guardians must agree')
    .option('--recovery', 'set-guardians: guardians may also recover a lost wallet')
    .option('--timing <preset>', 'set-timing: drill, sixMonths or twelveMonths')
    .option('--period <duration>', 'set-timing: check-in period, such as 30d')
    .option('--threshold <n>', 'set-timing: missed periods before the alarm (1 to 15)')
    .option('--window <duration>', 'set-timing: time to cancel an alarm, such as 7d')
    .option('--asset <kind:token[:id][@heir]>', 'set-assets: an asset; repeat for each', collect, [])
    .option('--off', 'attest-death: withdraw your attestation')
    .option('--target <address>', 'vote-recovery: the new wallet')
    .option('--withdraw', 'vote-recovery: withdraw your vote');
}
