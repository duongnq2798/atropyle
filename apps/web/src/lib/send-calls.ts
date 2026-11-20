import { AtropyleError, type SendCallsParams } from '@atropyle/sdk';
import type { Address, Hex } from 'viem';
import { call, type Eip1193, providerErrorCodes } from './wallet';

/** 4200 unsupported method, -32601 method not found, -32602 bad params, 5700/5710 EIP-5792 capability errors. */
export const UNSUPPORTED_CODES: ReadonlySet<number> = new Set([4200, -32601, -32602, 5700, 5710]);

export class CallsUnsupported extends Error {
  constructor(cause: unknown) {
    super('The wallet does not support wallet_sendCalls.', { cause });
    this.name = 'CallsUnsupported';
  }
}

export function isUnsupported(e: unknown): boolean {
  return providerErrorCodes(e).some((c) => UNSUPPORTED_CODES.has(c));
}

export async function supportsSendCalls(p: Eip1193, account: Address, chainId: number): Promise<boolean> {
  try {
    const key = `0x${chainId.toString(16)}`;
    const caps = await call<unknown>(p, 'wallet_getCapabilities', [account, [key]]);
    // EIP-5792 keys the capabilities by chain id; a reply without our chain says nothing about it.
    const mine = caps && typeof caps === 'object' ? (caps as Record<string, unknown>)[key] : null;
    return !!mine && typeof mine === 'object';
  } catch {
    return false;
  }
}

export type CallsStatus = 'pending' | 'confirmed' | 'failed' | 'reverted' | 'partial';

export interface CallsResult {
  id: string;
  status: CallsStatus;
  hashes: Hex[];
  ok: boolean;
}

/** EIP-5792 codes (100/200/400/500/600) and the 'PENDING'/'CONFIRMED' strings of earlier drafts. */
export function normalizeStatus(raw: unknown): CallsStatus {
  if (raw === 'PENDING' || (typeof raw === 'number' && raw >= 100 && raw < 200)) return 'pending';
  if (raw === 'CONFIRMED' || raw === 200) return 'confirmed';
  if (raw === 500) return 'reverted';
  if (raw === 600) return 'partial';
  return 'failed';
}

export interface SendCallsOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onStatus?: (s: CallsStatus) => void;
}

interface CallsStatusReply {
  status?: unknown;
  receipts?: { transactionHash?: unknown; status?: unknown }[];
}

export async function sendCalls(p: Eip1193, params: SendCallsParams, o: SendCallsOptions = {}): Promise<CallsResult> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let sent: unknown;
  try {
    sent = await call<unknown>(p, 'wallet_sendCalls', [params]);
  } catch (e) {
    if (isUnsupported(e)) throw new CallsUnsupported(e);
    throw e;
  }
  const id = typeof sent === 'string' ? sent : (sent as { id?: unknown } | null)?.id;
  if (typeof id !== 'string') throw new AtropyleError('UNKNOWN', { message: 'The wallet returned no call bundle id.' });
  const deadline = Date.now() + (o.timeoutMs ?? 600_000);
  for (;;) {
    const r = await call<CallsStatusReply | null>(p, 'wallet_getCallsStatus', [id]);
    const status = normalizeStatus(r?.status);
    o.onStatus?.(status);
    if (status !== 'pending') {
      const receipts = r?.receipts ?? [];
      const hashes = receipts.map((x) => x.transactionHash).filter((h): h is Hex => typeof h === 'string');
      const allOk = receipts.every((x) => x.status === undefined || x.status === '0x1' || x.status === 'success');
      return { id, status, hashes, ok: status === 'confirmed' && allOk };
    }
    if (Date.now() >= deadline) return { id, status, hashes: [], ok: false };
    await sleep(o.intervalMs ?? 1500);
  }
}
