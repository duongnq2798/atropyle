import { type Address, type Hex, isAddress, isHex, toHex } from 'viem';
import { AtropyleError } from '../errors';
import type { PreparedTx, TxPlan } from '../prepare/types';
import { decodePayload, encodePayload, type SignPayload } from './payload';

export * from './payload';

export type CastTx = Pick<PreparedTx, 'chainId' | 'from' | 'to' | 'data' | 'value'>;

export interface SendCallsParams {
  version: '2.0.0';
  chainId: Hex;
  from: Address;
  atomicRequired: false;
  calls: { to: Address; data: Hex; value: Hex }[];
}

const isPlan = (x: TxPlan | SignPayload): x is TxPlan => 'summary' in x;

export function toPayload(plan: TxPlan): SignPayload {
  return {
    chainId: plan.chainId,
    from: plan.from,
    steps: plan.steps.map((s) => ({ to: s.to, data: s.data, value: s.value })),
  };
}

const asPayload = (x: TxPlan | SignPayload): SignPayload => (isPlan(x) ? toPayload(x) : x);

/** `<base>#/sign?p=…`: everything after # stays in the browser and never reaches a server (spec §15). */
export function signLink(plan: TxPlan | SignPayload, base: string): string {
  if (!/^https?:\/\/[^\s#]+/i.test(base)) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'The base of a signing link must be an http(s) URL.' });
  }
  const root = base.split('#')[0];
  const sep = root.endsWith('/') || /\.html?$/.test(root) ? '' : '/';
  return `${root}${sep}#/sign?p=${encodePayload(asPayload(plan))}`;
}

export function parseSignLink(link: string): SignPayload {
  const hash = link.includes('#') ? link.slice(link.indexOf('#') + 1) : link;
  const m = /^\/sign\?([^#]*)$/.exec(hash);
  const ps = m ? m[1].split('&').filter((x) => x.startsWith('p=')) : [];
  if (ps.length === 0) {
    throw new AtropyleError('LINK_INVALID', { message: 'The signing link is invalid: it has no #/sign?p= part.' });
  }
  // A browser reads the first p, a regex the last: a link with two would show one request and sign another.
  if (ps.length > 1) {
    throw new AtropyleError('LINK_INVALID', {
      message: 'The signing link is invalid: it has more than one p parameter.',
    });
  }
  return decodePayload(ps[0].slice(2));
}

const SAFE_URL = /^https?:\/\/[A-Za-z0-9.\-:/_]+$/;

/** Only addresses, hex and numbers reach a shell line: a prepared tx edited by hand cannot add a command. */
function assertShellSafe(tx: CastTx): void {
  const ok =
    Number.isSafeInteger(tx.chainId) &&
    tx.chainId > 0 &&
    isAddress(tx.from, { strict: false }) &&
    isAddress(tx.to, { strict: false }) &&
    isHex(tx.data) &&
    typeof tx.value === 'bigint' &&
    tx.value >= 0n;
  if (!ok) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'The transaction is not a plain call: chain id, addresses, calldata and value must be valid.',
    });
  }
}

/** A `cast send` line with no key: the user adds --account <name> (spec §5.2). */
export function castCommand(tx: CastTx, rpcUrl: string): string {
  if (!SAFE_URL.test(rpcUrl)) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'The RPC URL contains characters that are not safe in a shell command.',
    });
  }
  assertShellSafe(tx);
  const parts = ['cast send', tx.to, tx.data, '--from', tx.from, '--chain', String(tx.chainId), '--rpc-url', rpcUrl];
  if (tx.value > 0n) parts.push('--value', tx.value.toString());
  return parts.join(' ');
}

/** Pass as `params: [sendCallsParams(plan)]` of `wallet_sendCalls` (EIP-5792 2.0.0). */
export function sendCallsParams(plan: TxPlan | SignPayload): SendCallsParams {
  const p = asPayload(plan);
  return {
    version: '2.0.0',
    chainId: toHex(p.chainId),
    from: p.from,
    atomicRequired: false,
    calls: p.steps.map((s) => ({ to: s.to, data: s.data, value: toHex(s.value) })),
  };
}

/** OKX Agentic Wallet; its first run asks for confirmation and exits 2 (spec §11.5). */
export function okxCommand(tx: CastTx): string {
  assertShellSafe(tx);
  if (tx.value !== 0n) {
    throw new AtropyleError('INVALID_OPTIONS', {
      message: 'The OKX Agentic Wallet handoff only supports calls without native value.',
    });
  }
  return `onchainos wallet contract-call --chain ${tx.chainId} --to ${tx.to} --input-data ${tx.data}`;
}
