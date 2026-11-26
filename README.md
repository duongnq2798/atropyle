# Atropyle

Atropyle is the inheritance and recovery rule nobody has to trust, already live on X Layer.

**Check it without a wallet:**

- Open the proof page, [https://atropyle.xyz/#/proof](https://atropyle.xyz/#/proof), and press "Run the proof". Your browser reads the policy circuit from X Layer and checks all 67,108,864 combinations of state and input. A vault page shows the same checks for one vault, for example the test Drill vault at [`#/v/0x481F…f4b9/verify`](https://atropyle.xyz/#/v/0x481F28748959036B48bc6779797228D74f15f4b9/verify), which expires on 29 November 2026 at 08:28:06 UTC and can still be read after that.
- Or run one command, read-only:

  ```bash
  npx -y atropyle@0.1.0 verify
  ```

  The npm publish is planned. Until then, run it from a checkout of this repository. It needs Node.js 24, and neither Foundry nor the contract build:

  ```bash
  npm ci && npm run build && npm run build -w packages/mcp && npm run build -w packages/cli
  node packages/cli/dist/bin.js verify
  ```

## What it does

An Atropyle vault decides what happens to a wallet's tokens and NFTs when its owner can no longer sign. The assets never move into the vault: they stay in the owner's wallet, and the vault holds an approval for each one.

- **Check-ins.** The owner chooses a period (at least 1 day) and a threshold of 1 to 15 missed periods. Any transaction the owner signs to the vault counts as a check-in.
- **Alarm and window.** Once the owner has missed the threshold, anyone can raise the alarm. The alarm opens a window of at least 3 days. One check-in from the owner during the window cancels it, and nothing moves.
- **Heirs.** Up to 5 heirs with shares in basis points that add up to 100%, and up to 20 assets (ERC-20, ERC-721, ERC-1155). Once the vault is released after the window, each ERC-20 is split by the shares, and each NFT goes to the heir it names.
- **Guardians.** Up to 5 guardians, of whom `k` must agree. With `k` at least 1, heirs receive the assets after the window only if `k` guardians confirmed the death, or if the owner has been silent for 15 periods. With `k` = 0 the window alone is enough.
- **Recovery (optional).** If the owner turns it on, `k` guardians who vote for the same new wallet start a recovery window. If the owner does not check in before it ends, everything goes to that wallet, which is meant for the owner's new wallet after a lost key.
- **Drill.** A free practice vault with timings in seconds (60 seconds at least), which runs the same circuit and expires after 7 days.

## What decides it

The policy circuit `AtropylePolicy v1` (circuit 3 on the TapeOut processor `ATRO`, 199 gates) decides every lifecycle transition of a vault, and so every release of its assets. [`AtropyleVault.sol`](contracts/src/AtropyleVault.sol) builds the 23 input bits from its storage and the block time (missed periods, threshold, guardian votes, `k`, "the owner signed this", "the window is over"), calls `step(policyId, state, inputs)` on the processor, and applies the next state and the alarm, cancel and release flags it returns. That call is the only code path that writes the vault's lifecycle state (`state` in the contract), and the vault reverts if the circuit answers with a state that does not exist. There are five states: Active, Grace (the inheritance alarm), Recovery, ReleasedInherit and ReleasedRecover. Released is final.

The Solidity code decides the rest. It checks who may call what and validates the configuration ([`VaultConfig.sol`](contracts/src/vault/VaultConfig.sol)), and once the circuit has released, [`VaultDistribution.sol`](contracts/src/vault/VaultDistribution.sol) decides who gets how much: each ERC-20 split by the heirs' basis points (the last heir gets the rounding remainder), each NFT to its heir, or everything to the recovery wallet. That part is covered by the Foundry tests in [`contracts/test/`](contracts/test), not by `verify`.

The vault implementation has no admin, no pause, no upgrade, no `delegatecall` and no `selfdestruct`; each vault is a minimal proxy (EIP-1167) of that one fixed implementation. The processor's circuits code sits behind a beacon that has no owner, so nobody can upgrade it either.

## Verify it yourself

`atropyle verify` and the proof page run the same SDK code ([`packages/sdk/src/verify/`](packages/sdk/src/verify)). Every read is pinned to one block and sent to two independent RPC operators: the deployment lists `rpc.xlayer.tech` and `xlayerrpc.okx.com` as one operator and `xlayer.drpc.org` as the other. If they answer differently, verify stops with `RPC_DISAGREEMENT`. With one operator only, it says so with a `SINGLE_RPC` warning. It checks that:

- the factory's `cpu()` and `policyId()` equal [`deployments/xlayer.json`](deployments/xlayer.json);
- the processor is a TapeOut processor named `Atropyle` / `ATRO`, its circuits beacon is the recorded one and is frozen (its `owner()` is the zero address), and its transistors contract is paired with it;
- the policy circuit has 23 inputs, 3 outputs and 3 state bits, and its references point to `KofN5` and `Ge4` on the same processor, with the recorded circuit ids;
- the keccak256 of each of the three netlists equals the bytes built from the source in [`circuits/`](circuits), and the hash recorded in the deployment file;
- the compiled netlists hold properties P1 to P8 on all 2^26 = 67,108,864 combinations of state and input (8 state codes × 2^23 inputs), and the compiled gate count equals the processor's `circuitInfo`;
- the processor itself answers like the local simulator (P9): 64 (state, input) vectors derived from a seed go through the processor's `step()` by `eth_call`, at the same block on every operator, and every answer must match. The seed is printed, and `--p9-seed` reruns it;
- on X Layer, the keccak256 of the runtime code of the processor proxy and of its implementation equal the hashes pinned in the SDK ([`packages/sdk/src/verify/pins.ts`](packages/sdk/src/verify/pins.ts)).

The properties, from the policy spec the MCP server serves as `atropyle://policy/spec`:

| #   | Property                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | A released vault keeps its state and outputs nothing.                                                                                                                                   |
| P2  | A check-in by the owner always brings a vault that is not released back to Active.                                                                                                      |
| P3  | A vault releases to its heirs only from Grace, after the window, in a transaction the owner did not sign, with `k` guardian confirmations or 15 silent periods, and no recovery quorum. |
| P4  | A vault releases to the recovery wallet only from Recovery, after the window, in a transaction the owner did not sign, with `k` votes (`k` at least 1) for that wallet.                 |
| P5  | From Active, the inheritance alarm starts only after missed check-ins, and the recovery alarm only after a recovery quorum, never in the transaction of a check-in.                     |
| P6  | A vault that is not released never reaches an undefined state.                                                                                                                          |
| P7  | The alarm, cancel and release flags follow the output table of the spec.                                                                                                                |
| P8  | The circuit answers exactly like the TypeScript reference model, on every combination.                                                                                                  |

`atropyle verify --vault <address>` also checks one vault: the factory created it, its code is the minimal proxy (EIP-1167) of the factory's implementation, it is bound to the same factory, processor and policy, the implementation's code hash equals the recorded one, and the netlists of its processor at that block are the ones just proven.

What verify does not check: plain `verify` covers the circuit and the processor only. With `--vault`, it also compares the implementation's code hash with the hash in the deployment file, not with a build of `contracts/src`. `atropyle doctor` compares the factory's implementation and treasury, and that code hash, with the deployment file, and checks that each recorded fee token has a fee. Nothing compares the code of the factory or of the implementation with the source until it is verified on OKLink (still to do), and verify does not cover the Solidity distribution code.

Results recorded in [`docs/deployments.md`](docs/deployments.md) at block 76567369: P1-P8 hold on all 67,108,864 combinations, the three netlists match the source, the beacon is frozen and the two RPC operators agree. A run of `node packages/cli/dist/bin.js verify` from a checkout at block 76826189 (25 November 2026, 08:27 UTC) gave the same result, with no issue and no warning. With P9, a run at block 76844404 (25 November 2026, 13:30 UTC) gave the same again, and `step()` matched the simulator on all 64 vectors of seed 1024806469244010215 at both operators, with the processor's code equal to its pins.

## Deployed contracts

X Layer mainnet, chain 196, from [`deployments/xlayer.json`](deployments/xlayer.json). Deployed on 22 November 2026 between blocks 76566929 and 76567053 (08:26 to 08:28 UTC); the transactions are in [`docs/deployments.md`](docs/deployments.md).

| Contract                                | Address                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `AtropyleFactory` (from block 76567034) | [`0x7eCbBECA8F90A868A12aF48B766264bf9c87a651`](https://www.oklink.com/xlayer/address/0x7eCbBECA8F90A868A12aF48B766264bf9c87a651) |
| `AtropyleVault` implementation          | [`0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881`](https://www.oklink.com/xlayer/address/0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881) |
| TapeOut processor `ATRO`                | [`0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05`](https://www.oklink.com/xlayer/address/0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05) |
| Circuits beacon (frozen)                | [`0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C`](https://www.oklink.com/xlayer/address/0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C) |
| TapeOut factory                         | [`0x1f09DAeFA827f02CBb40967cc91b259763760761`](https://www.oklink.com/xlayer/address/0x1f09DAeFA827f02CBb40967cc91b259763760761) |
| Treasury                                | [`0x990221559B7EB3516204dc73535d6581391cFAa4`](https://www.oklink.com/xlayer/address/0x990221559B7EB3516204dc73535d6581391cFAa4) |
| Fee token USDT0                         | [`0x779Ded0c9e1022225f8E0630b35a9b54bE713736`](https://www.oklink.com/xlayer/address/0x779Ded0c9e1022225f8E0630b35a9b54bE713736) |
| Fee token USDC                          | [`0xB6CEceAB302E2E4948951eE7843FC24E92933061`](https://www.oklink.com/xlayer/address/0xB6CEceAB302E2E4948951eE7843FC24E92933061) |
| Fee token USDG                          | [`0x4ae46a509F6b1D9056937BA4500cb143933D2dc8`](https://www.oklink.com/xlayer/address/0x4ae46a509F6b1D9056937BA4500cb143933D2dc8) |

Circuits on `ATRO`: `KofN5` is id 1, `Ge4` is id 2 and `AtropylePolicy v1` is id 3. The netlist hashes and the implementation's code hash are in [`deployments/xlayer.json`](deployments/xlayer.json).

## Fees

- **Drill: free.** No Atropyle fee; you pay only X Layer gas, in OKB.
- **Paid vault:** 1.99 while the factory has created fewer than 100 paid vaults, then 9.90, in USDT0, USDC or USDG (each has 6 decimals, so 1,990,000 or 9,900,000 base units). The fee goes straight to the treasury in the `createVault` transaction ([`AtropyleFactory.sol`](contracts/src/AtropyleFactory.sol)). Both levels are fixed at deployment, and nobody can change them.

## Packages

| Package                                                       | What it is                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`@atropyle/sdk`](packages/sdk)                               | TypeScript SDK: read a vault at one block, predict its timeline with the on-chain netlist, prepare and simulate transactions, verify |
| [`@atropyle/mcp`](packages/mcp)                               | MCP server (stdio) with seven tools: reads, simulations, verify and unsigned transactions. It never signs                            |
| [`atropyle`](packages/cli)                                    | The CLI: `verify`, `status`, `vaults`, `simulate`, `plan`, `prepare`, `doctor` and `mcp`, with a `--json` mode for agents            |
| [`atropyle-estate-planning`](skills/atropyle-estate-planning) | Agent Skill: plan heirs, guardians and timing, run a Drill, create a vault and check in                                              |
| [`atropyle-guardian`](skills/atropyle-guardian)               | Agent Skill: verify a vault, then attest, vote for recovery or claim                                                                 |
| [Claude Code plugin](.claude-plugin)                          | Both skills and the MCP server                                                                                                       |

None of them asks for a private key: they prepare transactions, and you sign in your own wallet. All are at version 0.1.0. The npm publish of `@atropyle/sdk`, `@atropyle/mcp` and `atropyle` is planned and not done yet, so the `npx` commands in this repository work only after it; until then, run them from a checkout. The OKX Agentic Wallet hand-off (`--format okx`) is described in [`packages/cli/README.md`](packages/cli/README.md).

## Build log

Key milestones, with the dates of their commits in `git log` (UTC+7):

- **18 Nov 2026.** Design spec. The policy circuit, with the exhaustive P1-P8 proof (`84f02ad`).
- **19 Nov.** Contracts: the vault, the factory, the tape-out flow and fork tests against the real TapeOut contracts (PR #1).
- **20 Nov.** The SDK with quorum reads and `verifyPolicy` (PR #2). The MCP server, the CLI, the two Agent Skills and the Claude Code plugin (PR #3).
- **21 Nov.** The web app with the in-browser proof (PR #4), and the one-command mainnet deploy (`63bb747`).
- **22 Nov.** Mainnet deployment (blocks 76566929 to 76567053), recorded in `deployments/xlayer.json` (PR #7).
- **23 Nov.** The backend: email alerts and the keeper (PR #9).
- **25 Nov.** The web app v2 on Next.js (PR #10). The Vercel production target for https://atropyle.xyz/ (`72b09a4`) and the packages made ready for npm 0.1.0 (`c9e67cd`).

## Traction

Read from the factory on X Layer mainnet at block 76825123 (25 November 2026, 08:09:19 UTC):

| Metric         | Value | How it was read                                                                                             |
| -------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| Vaults created | 1     | `VaultCreated` events of the factory from block 76567034 to 76825123, by `eth_getLogs` on `rpc.xlayer.tech` |
| Drill vaults   | 1     | The same events, `drill = true`                                                                             |
| Paid vaults    | 0     | `paidCount()` by `eth_call` on `rpc.xlayer.tech` and `xlayerrpc.okx.com`, which agree                       |
| Current fee    | 1.99  | `currentFee(token)` = 1,990,000 for each of the three fee tokens, at the same block                         |

The one vault is the test Drill vault [`0x481F28748959036B48bc6779797228D74f15f4b9`](https://www.oklink.com/xlayer/address/0x481F28748959036B48bc6779797228D74f15f4b9), which the deployer created during the deployment (block 76567050). Nobody else has created a vault yet.

The deployer and the treasury are team wallets, listed with a public source for each in [`deployments/team.json`](deployments/team.json). The SDK's `counters()` and `npm run daily:check` count a vault as a team vault when its owner is in that file, so the team's own Drills never count as user vaults.

## Limits

- **Not audited.** The site shows "Beta — unaudited". Run a Drill before you give a vault rights over real assets. Slither and `forge lint` run in CI, and every finding they report is triaged in [`docs/security/static-analysis.md`](docs/security/static-analysis.md): none can lose or lock funds.
- **Immutable contracts.** No admin, no pause, no upgrade. A bug in the deployed contracts cannot be patched; see [`SECURITY.md`](SECURITY.md).
- **Native OKB is not covered.** A vault covers ERC-20, ERC-721 and ERC-1155 tokens through approvals ([`VaultConfig.sol`](contracts/src/vault/VaultConfig.sol)). Wrap OKB to WOKB, an ERC-20, to have it covered.
- **The circuit decides when, Solidity decides who gets what.** `verify` proves the circuit. The split between heirs, the gas caps on each transfer and the handling of tokens that fail are Solidity, covered by the Foundry tests and listed under [known limits in `contracts/README.md`](contracts/README.md#known-limits).
- **Coverage is what the owner's wallet holds and has approved.** A vault pulls `min(balance, allowance)` of each asset at release. Tokens the owner moves away or stops approving are not covered.
- **The owner cannot raise their own alarm.** Before release, every call the owner signs is a check-in, `poke()` and `distribute()` included. To try a Drill with one person, call `poke()` from another address.
- **A Drill expires after 7 days.** After that, every transaction to it reverts; reads still work.
- **The OKX Agentic Wallet path is not tested end to end** ([`packages/cli/README.md`](packages/cli/README.md)).
- **The keeper is a convenience.** `poke()` and `distribute()` are permissionless: anyone can call them, from any wallet ([`SECURITY.md`](SECURITY.md#if-atropyle-disappears)). The keeper in [`apps/backend`](apps/backend) only pays the gas for them.
- **Still to do.** The source verification on OKLink, a builder code (`builderCode` is `null` in [`deployments/xlayer.json`](deployments/xlayer.json)), the DeWEB copy of the site, and the npm publish.

## Repository layout

| Path               | What                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/`       | Solidity contracts (Foundry)                                                                                                      |
| `circuits/`        | The policy circuit and its netlists                                                                                               |
| `packages/sdk/`    | `@atropyle/sdk`: read, simulate, verify and prepare                                                                               |
| `packages/mcp/`    | `@atropyle/mcp`: the MCP server (stdio) and the shared operations (`@atropyle/mcp/ops`)                                           |
| `packages/cli/`    | `atropyle`: the CLI                                                                                                               |
| `skills/`          | Agent Skills `atropyle-estate-planning` and `atropyle-guardian`                                                                   |
| `.claude-plugin/`  | Claude Code marketplace and plugin                                                                                                |
| `examples/`        | `agent-mcp-client`: an MCP client that never signs, and client configs. `node-quickstart`: the SDK in about 40 lines              |
| `apps/web/`        | The web app v2 (Next.js 16 static export, targets `vercel` and `deweb`), built by Plans 7A, 7B and 7C                             |
| `apps/web-legacy/` | The previous web app (Vite + Preact). Until the v2 cutover it is the production site at https://atropyle.xyz (root `vercel.json`) |
| `deployments/`     | Deployed addresses, per chain                                                                                                     |
| `apps/backend/`    | `@atropyle/backend` (private): Supabase Edge Functions, email templates (React Email, EN and VI) and the keeper                   |
| `supabase/`        | Postgres migrations, the `pg_cron` schedule and the CLI config of the eight Edge Functions                                        |

## Development

Node.js 24 and Foundry 1.9.0.

```bash
git submodule update --init --recursive
npm ci
cd contracts && forge build && cd ..
npm run build                      # circuits, then the SDK
npm run build -w packages/mcp
npm run build -w packages/cli
node packages/cli/dist/bin.js verify
```

The build order matters: each package tests against the built `dist` of the packages it depends on. Then:

```bash
npm test
npm run typecheck
cd contracts && forge test && cd ..
npm run devnet                     # a local anvil devnet on port 8545 with the full contract set
```

[`AGENTS.md`](AGENTS.md) has every build and test command, the web app checks and the rules of this repository.

## License

[MIT](LICENSE).
