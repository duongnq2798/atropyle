import { type AtropyleClient, type StateName, stateName, type VaultEvent } from '@atropyle/sdk';
import { type Address, getAddress, type Hex, isAddress } from 'viem';
import { type StateChange, stateChanges } from '@/tx/receipt-view';
import { historyFromBlock } from './heir';

/** Block times read per window at most: each is one eth_getBlock; entries past it show their block number. */
export const HISTORY_TIMES = 40;

const CONFIG_PART = { 1: 'heirs', 2: 'guardians', 3: 'timing', 4: 'assets' } as const;
export type ConfigPart = (typeof CONFIG_PART)[keyof typeof CONFIG_PART];

/** One thing a transaction did, in log order. */
export type HistoryRow = { logIndex: number } & (
  | { kind: 'checkIn' }
  | { kind: 'config'; part: ConfigPart | null }
  | { kind: 'attest'; guardian: Address; on: boolean }
  /** target null: the guardian withdrew their vote. */
  | { kind: 'vote'; guardian: Address; target: Address | null }
  | { kind: 'alarm'; state: StateName | null; target: Address | null }
  | { kind: 'cancel'; byOwner: boolean }
  | { kind: 'release'; state: StateName | null; target: Address | null }
  /** Every Distributed and TransferFailed of the transaction, as one row. */
  | { kind: 'transfers'; sent: number; failed: number }
);

/** What a transaction is known by: its first row, or the circuit's decision when it has no other. */
export type HistoryKind = HistoryRow['kind'] | 'decided';

/** One transaction of the vault (spec §18.4.2 T9): what it did, and what the circuit decided in it. */
export interface HistoryTx {
  hash: Hex;
  blockNumber: bigint;
  /** The first log of the transaction: it orders two transactions of one block. */
  logIndex: number;
  /** Unix seconds; null when the block time was not read. */
  at: bigint | null;
  rows: HistoryRow[];
  /** Each StateChanged(from, to) whose codes name a state: "Decided by the circuit: A → B". */
  decided: StateChange[];
}

export interface HistoryPage {
  txs: HistoryTx[];
  fromBlock: bigint;
  toBlock: bigint;
  /** Older blocks exist above the floor. */
  more: boolean;
}

type TransfersRow = Extract<HistoryRow, { kind: 'transfers' }>;

const ZERO = '0x0000000000000000000000000000000000000000';
const addressOf = (v: unknown): Address | null =>
  typeof v === 'string' && isAddress(v, { strict: false }) ? getAddress(v) : null;
const targetOf = (v: unknown): Address | null => {
  const a = addressOf(v);
  return a === null || a === ZERO ? null : a;
};
const stateOf = (v: unknown): StateName | null => {
  if (typeof v !== 'number') return null;
  try {
    return stateName(v);
  } catch {
    return null;
  }
};
const partOf = (v: unknown): ConfigPart | null => (v === 1 || v === 2 || v === 3 || v === 4 ? CONFIG_PART[v] : null);

/** The row of one event; null for StateChanged (it becomes `decided`) and for an event this page does not know. */
function rowOf(e: VaultEvent): HistoryRow | null {
  const a = e.args;
  const logIndex = e.logIndex;
  switch (e.name) {
    case 'Alive':
      return { logIndex, kind: 'checkIn' };
    case 'ConfigUpdated':
      return { logIndex, kind: 'config', part: partOf(a.what) };
    case 'Attested': {
      const guardian = addressOf(a.guardian);
      return guardian && typeof a.on === 'boolean' ? { logIndex, kind: 'attest', guardian, on: a.on } : null;
    }
    case 'RecoveryVoted': {
      const guardian = addressOf(a.guardian);
      return guardian ? { logIndex, kind: 'vote', guardian, target: targetOf(a.target) } : null;
    }
    case 'AlarmRaised':
      return { logIndex, kind: 'alarm', state: stateOf(a.state), target: targetOf(a.target) };
    case 'AlarmCancelled':
      return { logIndex, kind: 'cancel', byOwner: a.byOwner === true };
    case 'Released':
      return { logIndex, kind: 'release', state: stateOf(a.state), target: targetOf(a.target) };
    default:
      return null;
  }
}

const inLogOrder = (x: VaultEvent, y: VaultEvent) =>
  x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1;
const newestFirst = (x: HistoryTx, y: HistoryTx) =>
  x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : x.blockNumber > y.blockNumber ? -1 : 1;

/**
 * One entry per transaction, newest first; inside it, its rows in log order. A distribute is one row however many
 * transfers it made. A transaction with nothing this page knows how to say is left out.
 */
export function historyTxs(events: readonly VaultEvent[]): HistoryTx[] {
  const groups = new Map<string, { tx: HistoryTx; events: VaultEvent[]; transfers: TransfersRow | null }>();
  for (const e of [...events].sort(inLogOrder)) {
    const key = e.transactionHash.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = {
        tx: {
          hash: e.transactionHash,
          blockNumber: e.blockNumber,
          logIndex: e.logIndex,
          at: null,
          rows: [],
          decided: [],
        },
        events: [],
        transfers: null,
      };
      groups.set(key, g);
    }
    g.events.push(e);
    if (e.name === 'Distributed' || e.name === 'TransferFailed') {
      const ok = e.name === 'Distributed';
      if (g.transfers) {
        if (ok) g.transfers.sent += 1;
        else g.transfers.failed += 1;
      } else {
        g.transfers = { logIndex: e.logIndex, kind: 'transfers', sent: ok ? 1 : 0, failed: ok ? 0 : 1 };
        g.tx.rows.push(g.transfers);
      }
      continue;
    }
    const row = rowOf(e);
    if (row) g.tx.rows.push(row);
    // Alive carries its own time: no block read is needed for it.
    if (e.name === 'Alive' && typeof e.args.at === 'bigint') g.tx.at = e.args.at;
  }
  const txs: HistoryTx[] = [];
  for (const g of groups.values()) {
    const decided = stateChanges(g.events);
    if (g.tx.rows.length > 0 || decided.length > 0) txs.push({ ...g.tx, decided });
  }
  return txs.sort(newestFirst);
}

type HistoryClient = Pick<AtropyleClient, 'vault' | 'publicClient'>;

/**
 * The transactions of one window of HISTORY_BLOCKS blocks ending at `toBlock` (the latest block when null), never
 * before `floor`. Block times are read for the newest HISTORY_TIMES blocks that need one; a failed read leaves `at` null.
 */
export async function historyWindow(
  atro: HistoryClient,
  vault: Address,
  toBlock: bigint | null,
  floor: bigint,
): Promise<HistoryPage> {
  const to = toBlock ?? (await atro.publicClient.getBlockNumber());
  const fromBlock = historyFromBlock(to, floor);
  const txs = historyTxs(await atro.vault(vault).events({ fromBlock, toBlock: to }));
  const blocks = [...new Set(txs.filter((x) => x.at === null).map((x) => x.blockNumber))].slice(0, HISTORY_TIMES);
  const read = await Promise.allSettled(blocks.map((blockNumber) => atro.publicClient.getBlock({ blockNumber })));
  const times = new Map<bigint, bigint>();
  read.forEach((r, i) => {
    if (r.status === 'fulfilled') times.set(blocks[i], r.value.timestamp);
  });
  return {
    txs: txs.map((x) => (x.at === null ? { ...x, at: times.get(x.blockNumber) ?? null } : x)),
    fromBlock,
    toBlock: to,
    more: fromBlock > floor,
  };
}

/**
 * The last change of state in blocks (from, to], and the block that carried it: how the vault page names the block of
 * a poke it did not send (a keeper, another visitor), seen between two of its reads (spec §18.4.2 T9). The page calls
 * it only when the span fits one eth_getLogs (deployment.logsBlockRange); null when no StateChanged is there.
 */
export async function movedBetween(
  atro: Pick<AtropyleClient, 'vault'>,
  vault: Address,
  from: bigint,
  to: bigint,
): Promise<{ to: StateName; block: bigint } | null> {
  if (to <= from) return null;
  const events = [...(await atro.vault(vault).events({ fromBlock: from + 1n, toBlock: to }))].sort(inLogOrder);
  let last: { to: StateName; block: bigint } | null = null;
  for (const e of events) {
    const c = stateChanges([e]).at(-1);
    if (c) last = { to: c.to, block: e.blockNumber };
  }
  return last;
}
