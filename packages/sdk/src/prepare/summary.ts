import { type Address, formatUnits } from 'viem';
import { formatDuration } from '../duration';
import type { Asset, Heir, Timing } from '../types';

// Every function takes typed values only. Token names and symbols (untrusted) are never parameters.

const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
const units = (v: bigint, decimals: number | null) =>
  decimals === null ? `${v} base units` : `${formatUnits(v, decimals)} (${v} base units)`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const heirList = (heirs: readonly Heir[]) => heirs.map((h) => `${h.account} ${pct(h.bps)}`).join(', ');

export interface CreateSummary {
  drill: boolean;
  heirs: readonly Heir[];
  guardians: readonly Address[];
  k: number;
  recoveryEnabled: boolean;
  timing: Timing;
  assets: readonly Asset[];
  fee: bigint;
  feeToken: Address;
  feeDecimals: number | null;
}

export const summarize = {
  checkIn: (vault: Address) =>
    `Check in as the owner of vault ${vault}: this resets the inactivity timer and clears pending guardian votes.`,
  setHeirs: (vault: Address, heirs: readonly Heir[]) => `Replace the heirs of vault ${vault}: ${heirList(heirs)}.`,
  setGuardians: (vault: Address, guardians: readonly Address[], k: number, recoveryEnabled: boolean) =>
    `Set ${plural(guardians.length, 'guardian')} for vault ${vault} (${k} of ${guardians.length} must confirm), wallet recovery ${recoveryEnabled ? 'on' : 'off'}${guardians.length ? `: ${guardians.join(', ')}` : ''}.`,
  setTiming: (vault: Address, t: Timing) =>
    `Set the timing of vault ${vault}: check in every ${formatDuration(t.period)}, alarm after ${t.threshold} missed check-ins, ${formatDuration(t.window)} alarm window.`,
  setAssets: (vault: Address, assets: readonly Asset[]) => {
    const count = (k: Asset['kind']) => assets.filter((a) => a.kind === k).length;
    return `Replace the asset list of vault ${vault} with ${plural(assets.length, 'asset')} (${count('erc20')} ERC-20, ${count('erc721')} ERC-721, ${count('erc1155')} ERC-1155).`;
  },
  attestDeath: (vault: Address, on: boolean) =>
    on
      ? `As guardian, confirm that the owner of vault ${vault} has died or is permanently unreachable.`
      : `As guardian, withdraw your death confirmation for vault ${vault}.`,
  voteRecovery: (vault: Address, target: Address | null) =>
    target
      ? `As guardian, vote to move the assets of vault ${vault} to the new wallet ${target}.`
      : `As guardian, withdraw your recovery vote for vault ${vault}.`,
  poke: (vault: Address) =>
    `Ask vault ${vault} to apply its policy now (anyone can do this; signed by the owner it is a check-in).`,
  distribute: (vault: Address) =>
    `Distribute the released assets of vault ${vault} (anyone can do this; before release, signed by the owner it is a check-in).`,
  approve20: (vault: Address, token: Address, amount: bigint | null, decimals: number | null) =>
    amount === null
      ? `Allow vault ${vault} to move an unlimited amount of ERC-20 token ${token}.`
      : `Allow vault ${vault} to move up to ${units(amount, decimals)} of ERC-20 token ${token}.`,
  approve721: (vault: Address, token: Address, id: bigint) =>
    `Allow vault ${vault} to move ERC-721 token ${token} #${id}.`,
  approveAll: (vault: Address, token: Address) => `Allow vault ${vault} to move all your tokens of contract ${token}.`,
  revoke20: (vault: Address, token: Address) => `Set the allowance of vault ${vault} for ERC-20 token ${token} to 0.`,
  revoke721: (vault: Address, token: Address, id: bigint) =>
    `Remove the approval of vault ${vault} for ERC-721 token ${token} #${id}.`,
  clear721: (token: Address, id: bigint) => `Remove the current approval of ERC-721 token ${token} #${id}.`,
  revokeAll: (vault: Address, token: Address) => `Stop vault ${vault} from moving your tokens of contract ${token}.`,
  approveFee: (factory: Address, token: Address, fee: bigint, decimals: number | null) =>
    `Allow the Atropyle factory ${factory} to take the creation fee of ${units(fee, decimals)} in token ${token}.`,
  createVault: (vault: Address, owner: Address, c: CreateSummary) => {
    const guard =
      c.k === 0
        ? 'no guardian confirmation'
        : `${c.k} of ${c.guardians.length} guardians must confirm${c.recoveryEnabled ? ', wallet recovery on' : ''}`;
    const fee = c.drill
      ? ', free'
      : `, fee ${c.feeDecimals === null ? `${c.fee} base units` : formatUnits(c.fee, c.feeDecimals)} of token ${c.feeToken}`;
    return `Create ${c.drill ? 'Drill ' : ''}vault ${vault} for ${owner}: ${plural(c.heirs.length, 'heir')} (${heirList(c.heirs)}), ${guard}, check in every ${formatDuration(c.timing.period)}, alarm after ${c.timing.threshold} missed check-ins, ${formatDuration(c.timing.window)} window, ${plural(c.assets.length, 'asset')}${fee}.`;
  },
};
