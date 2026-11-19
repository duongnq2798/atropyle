import { createTransport, type EIP1193RequestFn, type Transport } from 'viem';
import { AtropyleError } from '../errors';

export interface QuorumOptions {
  /** Extra attempts when an operator fails (it may not have reached the pinned block yet). Default 3. */
  retries?: number;
  retryDelayMs?: number;
}

/** Position of the block parameter for each method a quorum read compares (spec §5.4). */
const PINNED: Record<string, number> = {
  eth_call: 1,
  eth_getCode: 1,
  eth_getStorageAt: 2,
  eth_getBalance: 1,
  eth_getBlockByNumber: 0,
};
const COMPARED = new Set(['eth_chainId', ...Object.keys(PINNED)]);

type Outcome = { ok: true; value: unknown } | { ok: false; revert: string | null; error: unknown };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function canonical(method: string, v: unknown): string {
  if (method === 'eth_getBlockByNumber') return String((v as { hash?: string } | null)?.hash ?? null).toLowerCase();
  return typeof v === 'string' ? v.toLowerCase() : JSON.stringify(v);
}

/** Revert data when the error is an execution revert ('0x' if the node gives none), else null. */
function revertData(e: unknown): string | null {
  let cur = e as { code?: unknown; data?: unknown; message?: unknown; details?: unknown; cause?: unknown } | undefined;
  let found: string | null = null;
  for (let depth = 0; cur && typeof cur === 'object' && depth < 6; depth++) {
    const text = `${String(cur.message ?? '')} ${String(cur.details ?? '')}`;
    if (cur.code === 3 || /execution reverted/i.test(text)) {
      const d = cur.data as unknown;
      const hex =
        typeof d === 'string'
          ? d
          : typeof (d as { data?: unknown })?.data === 'string'
            ? (d as { data: string }).data
            : null;
      if (hex) return hex.toLowerCase();
      found ??= '0x';
    }
    cur = cur.cause as typeof cur;
  }
  return found;
}

/**
 * Sends every block-pinned read to all operators and only answers when they agree (spec §5.4). One transport per
 * independent operator; each may itself be a fallback over that operator's URLs.
 */
export function quorumTransport(transports: readonly Transport[], o: QuorumOptions = {}): Transport {
  if (transports.length === 0) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'A quorum needs at least one transport.' });
  }
  const retries = o.retries ?? 3;
  const delay = o.retryDelayMs ?? 1000;
  return ({ chain, pollingInterval, timeout }) => {
    const members = transports.map((t) => t({ chain, pollingInterval, retryCount: 0, timeout }));
    const request = (async ({ method, params }: { method: string; params?: unknown }) => {
      const list = (params ?? []) as unknown[];
      if (!COMPARED.has(method)) return members[0].request({ method, params } as never);
      const at = PINNED[method];
      if (at !== undefined && !(typeof list[at] === 'string' && /^0x[0-9a-fA-F]+$/.test(list[at] as string))) {
        throw new AtropyleError('INVALID_OPTIONS', {
          message: `${method} must be pinned to a block number for a quorum read.`,
          details: { method },
        });
      }
      let outcomes: Outcome[] = [];
      for (let attempt = 0; ; attempt++) {
        outcomes = await Promise.all(
          members.map(async (m): Promise<Outcome> => {
            try {
              return { ok: true, value: await m.request({ method, params } as never) };
            } catch (error) {
              return { ok: false, revert: revertData(error), error };
            }
          }),
        );
        const dead = outcomes.findIndex((x) => !x.ok && x.revert === null);
        if (dead === -1) break;
        if (attempt >= retries) {
          throw new AtropyleError('QUORUM_UNAVAILABLE', {
            message: `RPC operator #${dead + 1} did not answer ${method}.`,
            cause: (outcomes[dead] as { error: unknown }).error,
            details: { method, operator: dead },
          });
        }
        await sleep(delay);
      }
      const keys = outcomes.map((x) => (x.ok ? `ok:${canonical(method, x.value)}` : `revert:${x.revert}`));
      if (keys.some((k) => k !== keys[0])) {
        throw new AtropyleError('RPC_DISAGREEMENT', {
          message: `RPC operators returned different results for ${method}.`,
          details: { method, block: at === undefined ? null : list[at] },
        });
      }
      const first = outcomes[0];
      if (first.ok) return first.value;
      throw first.error;
    }) as EIP1193RequestFn;
    return createTransport(
      { key: 'quorum', name: 'Quorum', type: 'quorum', request, retryCount: 0 },
      { operators: members.length },
    );
  };
}
