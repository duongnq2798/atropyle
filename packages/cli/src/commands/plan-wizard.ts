import { type PresetName, toAddress } from '@atropyle/sdk';
import { parseAssets, parseHeirs } from '../actions';
import { UsageError } from '../exit';
import type { Io } from '../io';
import type { PlanInitFlags } from './plan';

const MAX_TRIES = 5;

/** Questions only in a terminal, never in JSON mode. */
export function canAsk(io: Io, g: { json: boolean }): boolean {
  return !g.json && io.isTTY && io.stdinTTY && io.prompt !== undefined;
}

/** Stops before the first question when the answers could not be written. */
export async function ensureWritable(io: Io, f: PlanInitFlags): Promise<void> {
  if (f.force === true) return;
  try {
    await io.readFile(f.out);
  } catch {
    return;
  }
  throw new UsageError(`${f.out} already exists. Use --force to overwrite it, or --out <file>.`);
}

/** Asks until `parse` accepts the answer. `parse` throws to reject it, and its message is shown. */
async function ask<T>(io: Io, question: string, parse: (answer: string) => T): Promise<T> {
  const prompt = io.prompt;
  if (prompt === undefined) {
    throw new UsageError('Cannot ask questions here. Give the plan as flags, starting with --heir <address>.');
  }
  for (let i = 0; i < MAX_TRIES; i++) {
    const answer = await prompt(question);
    if (answer === null) throw new UsageError('Cancelled. Nothing was written.');
    try {
      return parse(answer.trim());
    } catch (e) {
      io.err(`  ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  throw new UsageError(`No usable answer after ${MAX_TRIES} tries. Nothing was written.`);
}

/** Asks for up to `max` entries; `parse` returns null to end the list. */
async function askList(
  io: Io,
  max: number,
  question: (n: number) => string,
  parse: (answer: string, n: number) => string | null,
): Promise<string[]> {
  const out: string[] = [];
  while (out.length < max) {
    const n = out.length + 1;
    const v = await ask(io, question(n), (a) => parse(a, n));
    if (v === null) break;
    out.push(v);
  }
  return out;
}

const yesNo =
  (fallback: boolean) =>
  (a: string): boolean => {
    if (a === '') return fallback;
    if (/^y(es)?$/i.test(a)) return true;
    if (/^no?$/i.test(a)) return false;
    throw new Error('Answer y or n.');
  };

function sharesFor(heirs: readonly string[]) {
  return (a: string): string[] => {
    if (a === '') return [...heirs];
    const shares = a.split(/[\s,]+/).map((s) => s.replace(/%$/, ''));
    if (shares.length !== heirs.length) {
      throw new Error(`Give ${heirs.length} shares, one per heir, in the same order.`);
    }
    const specs = heirs.map((h, i) => `${h}:${shares[i]}`);
    parseHeirs(specs);
    const sum = shares.reduce((t, s) => t + Number(s), 0);
    if (Math.abs(sum - 100) > 0.01) throw new Error(`The shares add up to ${sum}, not 100.`);
    return specs;
  };
}

export async function askPlan(io: Io, base: PlanInitFlags): Promise<PlanInitFlags> {
  io.err(
    'Answer each question and press Enter. Ctrl+C stops; nothing is written until the end.\n' +
      'Atropyle never asks for a private key, a seed phrase or a password. Give wallet addresses only.\n',
  );
  const owner = await ask(io, 'Your wallet address, the owner (Enter to skip): ', (a) =>
    a === '' ? null : toAddress(a, 'owner'),
  );

  const heirs = await askList(
    io,
    5,
    (n) => (n === 1 ? 'Heir 1 wallet address: ' : `Heir ${n} wallet address (Enter when done): `),
    (a, n) => (a === '' && n > 1 ? null : toAddress(a, `heir ${n}`)),
  );
  const heir =
    heirs.length > 1
      ? await ask(
          io,
          `Shares in percent, ${heirs.length} numbers in the same order, such as 70 30 (Enter for equal shares): `,
          sharesFor(heirs),
        )
      : heirs;

  const guardian = await askList(
    io,
    5,
    (n) => `Guardian ${n} wallet address (Enter ${n === 1 ? 'for no guardians' : 'when done'}): `,
    (a, n) => (a === '' ? null : toAddress(a, `guardian ${n}`)),
  );
  let k: string | undefined;
  let recovery = false;
  if (guardian.length > 0) {
    const fallback = Math.floor(guardian.length / 2) + 1;
    k = await ask(io, `How many guardians must agree? 1 to ${guardian.length} (Enter for ${fallback}): `, (a) => {
      const v = a === '' ? fallback : Number(a);
      if (!Number.isInteger(v) || v < 1 || v > guardian.length) {
        throw new Error(`Answer a whole number from 1 to ${guardian.length}.`);
      }
      return String(v);
    });
    recovery = await ask(
      io,
      `Recovery: may any ${k} of these guardians who agree move everything in the vault to a wallet they choose, meant for your new wallet if you lose this one? You can stop it only by checking in before the window ends. Say yes only if you would trust any ${k} of them with everything. [y/N]: `,
      yesNo(false),
    );
  }

  const drill = await ask(
    io,
    'Start with a Drill, a practice vault that runs in minutes and expires after 7 days? [Y/n]: ',
    yesNo(true),
  );
  let preset: PresetName | undefined;
  if (!drill) {
    preset = await ask(
      io,
      'Timing: 1 = check in every 30 days, alarm after 6 missed; 2 = alarm after 12 missed (Enter for 1): ',
      (a): PresetName => {
        if (a === '' || a === '1') return 'sixMonths';
        if (a === '2') return 'twelveMonths';
        throw new Error('Answer 1 or 2.');
      },
    );
  }

  const asset = await askList(
    io,
    20,
    (n) => `Asset ${n} to cover, such as erc20:<token address> (Enter when done): `,
    (a) => {
      if (a === '') return null;
      parseAssets([a]);
      return a;
    },
  );

  return {
    ...base,
    ...(owner === null ? {} : { owner }),
    heir,
    guardian,
    ...(k === undefined ? {} : { k }),
    recovery,
    drill,
    ...(preset === undefined ? {} : { preset }),
    asset,
  };
}
