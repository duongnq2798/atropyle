# @atropyle/sdk

TypeScript SDK for [Atropyle](https://atropyle.xyz/): non-custodial inheritance and wallet-recovery vaults on X Layer. A frozen [TapeOut](https://tapeout.link) circuit that anyone can verify decides every lifecycle transition of a vault, and so every release of its assets.

- **Read** a vault at one pinned block: state, what happens next, and when.
- **Predict** with the exact netlist the chain runs (`whatIf`, `timeline`).
- **Prepare** any action as calldata plus simulation plus a plain-English summary. The SDK never asks for a private key.
- **Hand off** to the signer you already trust: a `#/sign` link, `cast send`, EIP-5792 `wallet_sendCalls`, or the OKX Agentic Wallet.
- **Verify** the policy (all 2^26 input combinations), the deployment and any vault, reading from two independent RPC operators.
- **Keep** vaults moving with the same keeper logic the hosted keeper runs.

Runs on Node >= 20, browsers, Cloudflare Workers and Deno. ESM and CommonJS.

## Install

```bash
npm install @atropyle/sdk viem
```

`viem` >= 2.45 is a peer dependency.

## Read a vault

```ts
import { createAtropyle } from '@atropyle/sdk';

const atro = createAtropyle({ chain: 'xlayer' });
const vault = atro.vault('0xYourVault');

const status = await vault.status(); // every field read at status.blockNumber
console.log(status.state, status.pending, status.lateAt);

const timeline = await vault.timeline(); // if nobody acts, what happens and when
for (const e of timeline.events) console.log(e.kind, e.state, new Date(Number(e.at) * 1000));
```

## Create a vault

```ts
const plan = atro.plan.template('guarded', {
  heirs: [
    { account: '0xHeirA', percent: 70 },
    { account: '0xHeirB', percent: 30 },
  ],
  guardians: ['0xG1', '0xG2', '0xG3'],
  assets: [{ kind: 'erc20', token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' }],
  drill: true, // practice vault: 60-second periods, expires after 7 days
});

const check = await atro.checkPlan(plan, { owner: '0xOwner', drill: true });
if (!check.ok) throw new Error(check.issues.map((i) => i.message).join('\n'));

const tx = await atro.prepare.createVault(plan, { owner: '0xOwner', drill: true });
console.log(tx.summary); // rebuilt from typed data, never from token metadata
for (const step of tx.steps) console.log(step.action, step.simulation);
```

Asset approvals default to the exact current balance. `allowance: 'unlimited'` exists and adds an `UNLIMITED_APPROVAL` warning.

## Sign it your way

```ts
atro.handoff.link(tx); // https://.../#/sign?p=...  the web app re-checks every byte before signing
atro.handoff.cast(tx.steps[0]); // cast send <to> <data> --from ... --chain 196 --rpc-url ...   (add --account <name>)
atro.handoff.calls(tx); // params for wallet_sendCalls (EIP-5792)
atro.handoff.okx(tx.steps[0]); // onchainos wallet contract-call --chain 196 --to ... --input-data ...

// Or, if you already hold a viem WalletClient:
await atro.send(tx, walletClient, { onStep: (e) => console.log(e.index, e.phase, e.hash) });
```

`atro.handoff.inspect(link)` decodes a signing link, refuses anything outside the Atropyle whitelist, rebuilds the summaries from calldata and re-simulates. This is what the `#/sign` page runs. Each `createVault` step gets `create`: the heirs, the guardians and `k`, and `exit`, the earliest time the assets can leave (`exitTimes` computes it from a config). A link creates at most one vault, only where none exists yet, and may not call it afterwards, so these terms are final.

A link that creates a Drill, or approves tokens to one, and also grants a token allowance can empty a wallet within minutes. So can a link that changes the heirs of a Drill, or sets its guardians with recovery on, since the Drill may already hold allowances. For such a link `confirm` lists the addresses the signer must type again (`reason` is `DRILL_WITH_ALLOWANCE` or `DRILL_RECIPIENTS_CHANGED`), and `ok` stays false until they are passed back in order. These addresses hold whichever steps revert on chain, because `inspect` also refuses calldata in any but the canonical ABI encoding, a second call to the same setter of a vault, and an allowance to a Drill whose heirs or guardians the same link changes. An RPC without `eth_simulateV1`, such as the X Layer ones, cannot simulate a step after the ones before it and reports a later step that fails alone as `skipped`: a link that needs `confirm` stays `ok: false` while any step is `skipped`.

```ts
const check = await atro.handoff.inspect(payload);
if (check.confirm && !check.confirm.confirmed) {
  // typed: what the signer typed for each of check.confirm.addresses, from their own records
  const again = await atro.handoff.inspect(payload, { confirmed: typed });
}
```

## Everyday actions

```ts
await vault.prepare({ type: 'checkIn' }, { as: owner });
await vault.prepare({ type: 'voteRecovery', target: '0xNewWallet' }, { as: guardian });
await vault.whatIf({ type: 'attestDeath', on: true }, { as: guardian }); // predicted effect, no transaction
```

## Verify

```ts
const policy = await atro.verifyPolicy(); // P1-P8 over all 2^26 (state, input) combinations, then P9
const deployment = await atro.integrity(); // factory, implementation, CPU, frozen beacon, code and netlist hashes
const report = await vault.verify(); // proxy, binding, policy and timeline at one block
```

All three read through a quorum of two RPC operators pinned to the same block, and fail with `RPC_DISAGREEMENT` if they differ. With one operator the result carries a `SINGLE_RPC` warning.

P9 checks the simulator against the processor itself. `verifyPolicy` derives 64 (state, input) vectors from a seed, asks each RPC operator on its own for the processor's `step()` on every vector by `eth_call` at the same block (16 calls per Multicall3 `aggregate3` when Multicall3 has its canonical code, single calls otherwise), and compares every answer with the local simulator. The seed is random unless you pass `verifyPolicy({ p9Seed })` (0 to 2^64 - 1), and `policy.p9.seed` holds it, so a run can be repeated. `policy.cpuCheck.code` compares the keccak256 of the runtime code of the processor proxy and of its implementation with hashes pinned in the SDK. `policy.ok` also needs P9 to hold and, on X Layer, the code to match its pins. `readPolicyBundle` runs P9 only when you pass its `p9` option (`{ operators, seed }`, one client per operator).

In a browser, keep the 2^26 enumeration off the main thread:

```ts
// main thread
import { chainOf, getDeployment, readTransport } from '@atropyle/sdk';
import { quorumTransport, readPolicyBundle } from '@atropyle/sdk/verify';
import { createPublicClient } from 'viem';

const d = getDeployment('xlayer');
const client = createPublicClient({
  chain: chainOf(d),
  transport: quorumTransport(d.quorumRpcUrls.map((group) => readTransport(group))),
  ccipRead: false, // token metadata is hostile input: never let a contract make this client fetch a URL
  cacheTime: 0,
});
worker.postMessage(await readPolicyBundle(client, d, d.quorumRpcUrls.length)); // plain data, bigint included

// worker.ts
import { evaluatePolicyBundle } from '@atropyle/sdk/verify';
self.onmessage = async (e) => self.postMessage(await evaluatePolicyBundle(e.data, { onProgress: (done, total) => {} }));
```

## Run a keeper

```ts
import { keeperTick } from '@atropyle/sdk';

// X Layer allows 100 blocks per eth_getLogs, so a scan is bounded. The first run covers the first 50,000 blocks from
// the factory's deployment block; loop until it reaches the chain head, then keep feed.cursor between runs.
let feed = await atro.scan({ maxBlocks: 50_000 });
while (feed.truncated) feed = await atro.scan({ resume: feed.cursor, maxBlocks: 50_000 });
// Later runs only read newer blocks:
feed = await atro.scan({ resume: feed.cursor, maxBlocks: 600 });

const report = await keeperTick(atro, feed.cursor.vaults, { wallet }); // omit wallet for a dry run
```

`poke` and `distribute` are permissionless and only ever pay heirs or the recovery wallet, so a keeper key can burn gas but cannot move assets. Use a wallet that is not a vault owner: before release an owner-signed poke or distribute is a check-in, so such a vault gets the outcome `owner-wallet` and nothing is sent. Every vault ends in one outcome with its own `nextCheckAt`, RPC failures included (`read-failed`, `send-failed`), so one rate limit never loses the hashes already sent. Pass either `resume` or `fromBlock` to `scan`, not both, and on a load-balanced RPC pass `toBlock` as the head minus a few blocks. Defaults: 20 attempts per run (a simulated or sent vault counts), a cap of 4,000,000 on the estimated gas of each transaction (`send()` still applies its 1.3x buffer to the gas limit), stop below 0.005 OKB.

## Entry points

| Import                  | Contents                                                      | Needs network |
| ----------------------- | ------------------------------------------------------------- | ------------- |
| `@atropyle/sdk`         | client, reads, prepare, send, handoff, keeper, ABIs, errors   | yes           |
| `@atropyle/sdk/plan`    | plan rules, presets, templates                                | no            |
| `@atropyle/sdk/handoff` | sign links, `cast`, EIP-5792, OKX formats                     | no            |
| `@atropyle/sdk/verify`  | quorum transport, policy proof, integrity, vault verification | yes           |

## Errors

Every failure is an `AtropyleError` with a stable `code`, a `hint` and a `docsUrl`:

```ts
import { decodeError, isTransportError } from '@atropyle/sdk';

try {
  await vault.status();
} catch (e) {
  const err = decodeError(e); // also decodes contract reverts
  if (isTransportError(err)) retryLater();
  else console.error(err.code, err.hint, err.docsUrl);
}
```

## Builder Code

When the deployment defines one, transactions carry the Atropyle [ERC-8021](https://eips.ethereum.org/EIPS/eip-8021) Builder Code suffix by default. Pass `builderCode: 'your-code'` to use your own, or `builderCode: null` to send none.

## Local devnet

From the Atropyle repository: `npm run devnet` starts anvil with the full contract set and three demo vaults. Then use `createAtropyle({ chain: 'local' })`. `npm run devnet:warp -- 3d` moves time forward.

## License

MIT
