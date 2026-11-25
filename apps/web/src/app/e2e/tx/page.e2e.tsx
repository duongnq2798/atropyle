'use client';

import {
  type ActionName,
  factoryAbi,
  type PreparedTx,
  type SendResult,
  type TxPlan,
  type VaultEvent,
  vaultAbi,
  type Warning,
} from '@atropyle/sdk';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  getAbiItem,
  type Hex,
  maxUint256,
  toFunctionSelector,
} from 'viem';
import { useSdk } from '@/chain/hooks';
import { useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import { mirrorPlan } from '@/tx/impl/mirror';
import type { MirrorContext } from '@/tx/mirror';
import type { ReceiptStep } from '@/tx/receipt-view';
import { TxCard } from '@/tx/tx-card';
import { applyStep, markRows, type TxView, txView } from '@/tx/tx-view';
import { type TxRunner, useTxRunner } from '@/tx/use-tx-runner';

/**
 * Every state of TxCard on one page, for axe and the review screenshots (test/e2e/tx.spec.ts), on stand-in runners
 * whose calldata viem builds here: nothing leaves the page. With `#live=<vault>&as=<owner>`, a real check-in of that
 * vault through useTxRunner, for the anvil e2e. Rendered after mount: the Receipt's local time is the browser's.
 */

const OWNER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const VAULT: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const FACTORY: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const USDG: Address = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const NFT: Address = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
const ITEMS: Address = '0x0165878A594ca255338adfa4d48449f69242Eb8F';
const NEW_WALLET: Address = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
const ZERO: Address = '0x0000000000000000000000000000000000000000';
const EXPLORER = 'https://www.oklink.com/xlayer';
const H1: Hex = '0x8a3f1c0e5b7d29e4c6a1f0b3d5e7092c4b6a8d1e3f5a7c9b0d2e4f6a8c0b1d3e';
const H2: Hex = '0x1d3e5f7a9c0b2d4e6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b1d';

const CONTEXT: MirrorContext = {
  factory: FACTORY,
  feeTokens: [USDG],
  tokens: [
    { address: USDG, kind: 'erc20', symbol: 'USDG', decimals: 6 },
    { address: NFT, kind: 'erc721', symbol: 'DEMO', decimals: null },
    { address: ITEMS, kind: 'erc1155', symbol: 'ITEMS', decimals: null },
  ],
};

const CREATE = `${toFunctionSelector(getAbiItem({ abi: factoryAbi, name: 'createVault' }))}${'0'.repeat(64)}` as Hex;
const approve = (spender: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
const forAll = (operator: Address, on: boolean) =>
  encodeFunctionData({ abi: erc721Abi, functionName: 'setApprovalForAll', args: [operator, on] });

function step(action: ActionName, to: Address, data: Hex, summary: string): PreparedTx {
  return {
    chainId: 196,
    from: OWNER,
    to,
    data,
    value: 0n,
    action,
    summary,
    warnings: [],
    simulation: { ok: true, gas: 64_000n },
  };
}
const planOf = (steps: PreparedTx[], warnings: Warning[] = []): TxPlan => ({
  chainId: 196,
  from: OWNER,
  vault: VAULT,
  steps,
  summary: '',
  warnings,
});

const RECOVERY: Warning = {
  code: 'RECOVERY_POWER',
  message: 'Recovery is on: 2 of 3 guardians can move 100% of the covered assets.',
  params: { k: 2, guardians: 3, window: 259_200 },
};

const MIRROR = planOf(
  [
    step('approve', USDG, approve(VAULT, maxUint256), `Allow vault ${VAULT} to move all of token ${USDG}.`),
    step('createVault', FACTORY, CREATE, `Create vault ${VAULT}.`),
  ],
  [RECOVERY],
);
const BUNDLE = planOf([
  step('approve', NFT, approve(VAULT, 2n), `Allow vault ${VAULT} to move token 2 of ${NFT}.`),
  step('setApprovalForAll', ITEMS, forAll(VAULT, true), `Allow vault ${VAULT} to move every token of ${ITEMS}.`),
  step('createVault', FACTORY, CREATE, `Create vault ${VAULT}.`),
]);
const REVOKE = planOf([
  step('approve', USDG, approve(VAULT, 0n), `Stop vault ${VAULT} from moving token ${USDG}.`),
  step('approve', NFT, approve(ZERO, 2n), `Clear the approval of token 2 of ${NFT}.`),
  step('setApprovalForAll', ITEMS, forAll(VAULT, false), `Stop vault ${VAULT} from moving your tokens of ${ITEMS}.`),
]);
const VOTE = planOf([
  step(
    'voteRecovery',
    VAULT,
    encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [NEW_WALLET] }),
    `Vote to move vault ${VAULT} to ${NEW_WALLET}.`,
  ),
]);
const CHECK_IN = planOf([
  step('checkIn', VAULT, encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' }), `Check in on vault ${VAULT}.`),
]);

const changed = (from: number, to: number, hash: Hex): VaultEvent => ({
  address: VAULT,
  name: 'StateChanged',
  args: { from, to },
  blockNumber: 4_812_337n,
  logIndex: 3,
  transactionHash: hash,
});
const confirmedAll = (p: TxPlan, hash: Hex): TxView =>
  p.steps.reduce((v, _s, index) => applyStep(v, { index, phase: 'confirmed', hash }), txView(p));
const CHECKED_IN: SendResult = {
  vault: VAULT,
  steps: [
    { index: 0, action: 'checkIn', hash: H1, blockNumber: 4_812_337n, gasUsed: 51_208n, events: [changed(1, 0, H1)] },
  ],
};
const CHECKED_IN_RECEIPT: ReceiptStep[] = [
  { index: 0, action: 'checkIn', hash: H1, blockNumber: 4_812_337n, time: 1_800_000_000n, events: [changed(1, 0, H1)] },
];
const BUNDLED_RECEIPT: ReceiptStep[] = MIRROR.steps.map((s, index) => ({
  index,
  action: s.action,
  hash: H2,
  blockNumber: 4_812_401n,
  time: 1_800_000_064n,
  events: [],
}));

const noop = () => undefined;

function fake(plan: TxPlan, over: Partial<TxRunner> = {}): TxRunner {
  const view = over.view ?? txView(plan);
  return {
    plan,
    view,
    busy: false,
    error: null,
    result: null,
    offset: 0,
    confirmed: view.rows.filter((r) => r.phase === 'confirmed').length,
    committed: false,
    blocker: null,
    switchFirst: false,
    handoffLink: null,
    explorer: EXPLORER,
    mode: 'steps',
    mirror: mirrorPlan(plan, CONTEXT),
    unsettled: null,
    bundle: null,
    rechecking: false,
    loadFailed: false,
    receipt: null,
    receiptReading: false,
    stale: false,
    send: noop,
    connect: noop,
    reload: noop,
    recheck: noop,
    adopt: noop,
    ...over,
  };
}

function Item({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div data-preview={id} className="flex min-w-0 flex-col gap-3">
      <h2 className="font-mono text-caption text-ink-muted">{title}</h2>
      {children}
    </div>
  );
}

function Previews() {
  return (
    <>
      <Item id="mirror" title="steps · the next one mirrored · unlimited · RECOVERY_POWER">
        <TxCard runner={fake(MIRROR)} label="Create vault" testId="p-mirror" />
      </Item>
      <Item id="bundle" title="one bundle · every call mirrored · NFT and setApprovalForAll">
        <TxCard runner={fake(BUNDLE, { mode: 'bundle' })} label="Create vault" testId="p-bundle" />
      </Item>
      <Item id="revoke" title="revokes · ERC-20 0 · ERC-721 to zero · setApprovalForAll false">
        <TxCard runner={fake(REVOKE)} label="Remove permissions" testId="p-revoke" />
      </Item>
      <Item id="vote" title="a vote for a new wallet · cannot be undone · danger">
        <TxCard runner={fake(VOTE)} label="Vote" tone="danger" testId="p-vote" />
      </Item>
      <Item id="unsettled-bundle" title="a bundle the wallet has not settled">
        <TxCard
          runner={fake(BUNDLE, {
            mode: 'bundle',
            view: markRows(txView(BUNDLE), 0, 'pending'),
            committed: true,
            blocker: 'unsettled',
            unsettled: {
              kind: 'bundle',
              base: 0,
              calls: { id: '0x5f3c9a1e', status: 'pending', hashes: [], ok: false },
            },
          })}
          label="Create vault"
          testId="p-unsettled-bundle"
        />
      </Item>
      <Item id="unsettled-step" title="a step sent, its receipt not read yet">
        <TxCard
          runner={fake(CHECK_IN, {
            view: applyStep(txView(CHECK_IN), { index: 0, phase: 'pending', hash: H1 }),
            committed: true,
            blocker: 'unsettled',
            unsettled: { kind: 'step', index: 0, hash: H1 },
          })}
          label="Check in"
          testId="p-unsettled-step"
        />
      </Item>
      <Item id="receipt" title="receipt · the circuit decided grace to active">
        <TxCard
          runner={fake(CHECK_IN, {
            view: confirmedAll(CHECK_IN, H1),
            committed: true,
            result: CHECKED_IN,
            receipt: CHECKED_IN_RECEIPT,
          })}
          label="Check in"
          testId="p-receipt"
          receiptFooter={<span className="text-ink-muted text-small">The page's footer slot</span>}
        />
      </Item>
      <Item id="receipt-bundle" title="receipt · two steps in one transaction (a smart account)">
        <TxCard
          runner={fake(MIRROR, {
            view: confirmedAll(MIRROR, H2),
            committed: true,
            result: { vault: VAULT, steps: [] },
            receipt: BUNDLED_RECEIPT,
          })}
          label="Create vault"
          testId="p-receipt-bundle"
        />
      </Item>
    </>
  );
}

function LiveCard({ plan }: { plan: TxPlan }) {
  const runner = useTxRunner({ plan });
  return <TxCard runner={runner} label="Check in" testId="live-tx" />;
}

/** A real check-in of `vault`, prepared by the SDK as `as`, sent through useTxRunner and the connected wallet. */
function Live({ vault, as }: { vault: Address; as: Address }) {
  const sdk = useSdk().data;
  const q = useQuery({
    queryKey: ['e2e-tx-live', vault, as],
    enabled: sdk !== undefined,
    queryFn: () => {
      if (!sdk) throw new Error('the SDK has not loaded');
      return sdk.atro.vault(vault).prepare({ type: 'checkIn' }, { as });
    },
  });
  if (q.error) return <p data-testid="live-error">{String(q.error)}</p>;
  return q.data ? <LiveCard plan={q.data} /> : <p data-testid="live-loading">Preparing the check-in</p>;
}

export default function TxPreview() {
  const mounted = useMounted();
  const params = new URLSearchParams(useLocationHash().slice(1));
  const live = params.get('live');
  const as = params.get('as');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6">
      <h1 className="font-display text-ink text-title">TxCard</h1>
      {!mounted ? null : live && as ? <Live vault={live as Address} as={as as Address} /> : <Previews />}
    </div>
  );
}
