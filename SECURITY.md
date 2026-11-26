# Security

## Report a vulnerability

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository and press **Report a vulnerability**. Only the maintainer sees the report. Please do not open a public issue, pull request or discussion for a vulnerability.

A good report names the component and where the problem is: a commit, an npm package and version, or a deployed address. It gives the steps or the transaction that show the problem, and what an attacker gains. Never send a private key or a seed phrase, yours or anyone's: nobody working on Atropyle will ever ask for one.

## Scope

- **Contracts**: [`contracts/src`](contracts/src), and the deployment on X Layer mainnet listed in [`docs/deployments.md`](docs/deployments.md).
- **Circuits**: the policy circuit and its sub-circuits in [`circuits/`](circuits), and the netlists taped out on the `ATRO` processor.
- **SDK**: [`packages/sdk`](packages/sdk), the verify code included.
- **CLI**: [`packages/cli`](packages/cli).
- **MCP server**: [`packages/mcp`](packages/mcp).
- **npm packages**: `@atropyle/circuits`, `@atropyle/sdk`, `@atropyle/mcp` and `atropyle` (version 0.1.0), built from this repository.
- **Web apps**: [`apps/web-legacy`](apps/web-legacy), which serves https://atropyle.xyz/, and [`apps/web`](apps/web).
- **Keeper**: [`apps/backend`](apps/backend), the keeper and the rest of the backend.

The TapeOut processor's own contracts, X Layer itself, the RPC operators, wallets and the tokens a vault covers are not ours to fix. Tell us anyway if a problem there puts Atropyle vaults at risk.

## What is immutable

The deployed contracts cannot be patched. The vault implementation and the factory have no admin, no pause, no upgrade, no `delegatecall` and no `selfdestruct`; every vault is a minimal proxy (EIP-1167) of that one implementation. The fee levels, the treasury and the policy circuit id are fixed in the factory. The netlists live on the `ATRO` processor, whose circuits beacon has no owner, so nobody can change the code that runs them.

So a fix cannot reach a deployed vault. Mitigations land in the SDK, the CLI, the MCP server, the web apps and the docs: they can refuse a dangerous plan, warn before a transaction, or stop offering a feature. A mitigation in any of the four packages reaches npm users only with a new version. Each package pins the packages it depends on to an exact version: the SDK pins `@atropyle/circuits`, the MCP server pins the SDK, and the CLI pins the SDK and the MCP server. So a fix in one also needs new versions of the packages that depend on it. The skills, the plugin and the docs get it only once their version pins move to that version. A fix in the contracts themselves needs a new deployment, and existing vaults would not move to it on their own.

## Known limits

The [Limits section of the README](README.md#limits) lists them, and [`contracts/README.md`](contracts/README.md#known-limits) gives the details of the distribution code: the gas caps on each transfer, tokens and heirs whose transfer fails, and the worst-case gas of a sweep.

The contracts are not audited. Slither and `forge lint` run on every push, and [`docs/security/static-analysis.md`](docs/security/static-analysis.md) triages every finding they report; CI fails on a new finding or on a triaged one that disappears.

## If Atropyle disappears

A vault keeps working without the site, the keeper or the CLI. Everything it needs is on X Layer: the vault, the factory and the `ATRO` processor. The assets never leave the owner's wallet before release, and the owner can always revoke the vault's approvals with any wallet or token tool.

Two functions move a vault forward, and **anyone** can call them, from any wallet. Neither takes an argument.

| Function       | Selector     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `poke()`       | `0x18178358` | Asks the circuit for the vault's next state at the current block time, and applies it. It raises the alarm once the owner has missed the threshold, and releases the vault once the window is over and the policy allows it. It does nothing once the vault is released.                                                                                                                                                                      |
| `distribute()` | `0xe4fc6b6d` | Before release, does what `poke()` does, and sweeps right away if that releases the vault. After release, pulls each covered asset from the owner's wallet and pays it out: each ERC-20 split between the heirs by their shares and each NFT to its heir, or everything to the recovery wallet. It can be called again later: each call moves what the owner's wallet holds and has approved at that moment. Returns `true` when a sweep ran. |

When to call them:

- `poke()` after the owner's deadline (`lateAt`, see below) to raise the alarm, and again after the window ends (`windowEndsAt`) to release the vault.
- `distribute()` once the vault is released, or after the window ends to release and sweep in one transaction.

Some rules from [`AtropyleVault.sol`](contracts/src/AtropyleVault.sol):

- Before release, a call signed by the owner is a check-in, not a poke: it cancels the alarm and never releases. Call from any other wallet.
- A guardian confirms a death with `attestDeath(bool)` and votes for a recovery wallet with `voteRecovery(address)`; the owner checks in with `checkIn()`. Those calls also run the circuit.
- A Drill expires 7 days after it was created (`expiresAt`). After that, every transaction to it reverts with `DrillExpired()`; reads such as `state()` and `status()` still work.
- `distribute()` pays only the heirs or the recovery wallet, never the caller. The caller pays the gas.

### Read the state with `cast`

[Foundry](https://getfoundry.sh/)'s `cast` reads the chain without a wallet. Replace the vault address with yours. The example is the test Drill vault, which expires on 29 November 2026 at 08:28:06 UTC: its reads keep working after that, but the `distribute()` simulation below then reverts with `DrillExpired()`.

```bash
export RPC=https://rpc.xlayer.tech
export FACTORY=0x7eCbBECA8F90A868A12aF48B766264bf9c87a651
export VAULT=0x481F28748959036B48bc6779797228D74f15f4b9   # the test Drill vault; use your vault's address

cast call $FACTORY "isVault(address)(bool)" $VAULT --rpc-url $RPC          # true: the Atropyle factory created it
cast call $VAULT "state()(uint8)" --rpc-url $RPC                           # 0 Active, 1 Grace, 3 Recovery, 5 ReleasedInherit, 7 ReleasedRecover
cast call $VAULT "status()((uint8,uint8,uint8,uint64,uint64,uint64,uint64,uint64,uint64,uint8,address,address[],uint256[]))" --rpc-url $RPC
cast call $VAULT "heirs()((address,uint16)[])" --rpc-url $RPC              # (heir, share in basis points)
cast call $VAULT "guardians()(address[])" --rpc-url $RPC
cast call $VAULT "assets()((uint8,address,uint256,uint8)[])" --rpc-url $RPC # (0 ERC-20 / 1 ERC-721 / 2 ERC-1155, token, id, heir index)
cast call $VAULT "coverage()(uint256[])" --rpc-url $RPC                    # what a sweep could move now, per asset
```

`status()` returns, in order: `state`, `pending` (the state a `poke()` from someone other than the owner would produce now), `idle` (whole periods since the last check-in, at most 15), `lastAlive`, `lateAt`, `alarmAt`, `windowEndsAt`, `releasedAt`, `expiresAt` (Drill only), `inhVotes`, `recoveryTarget`, the recovery vote of each guardian and the coverage of each asset. Times are unix seconds. When `pending` differs from `state`, a `poke()` changes something.

To find the vaults an address owns, inherits or guards, page through the factory's index:

```bash
export ME=0x...   # an owner, heir or guardian address
cast call $FACTORY "vaultsOfLength(address)(uint256)" $ME --rpc-url $RPC
cast call $FACTORY "vaultsOfPage(address,uint256,uint256)(address[])" $ME 0 20 --rpc-url $RPC
```

The index is append-only: an address removed as heir or guardian stays listed. Check the vault's current `heirs()` and `guardians()` before you act.

### Send `poke()` or `distribute()`

Simulate first; it sends nothing. `--from` is the address that will sign:

```bash
cast call $VAULT "distribute()(bool)" --from <your address> --rpc-url $RPC
```

Then sign with your own wallet, for example a Ledger or a Foundry keystore. Never put a private key on the command line.

```bash
cast send $VAULT "poke()" --rpc-url $RPC --chain 196 --ledger
cast send $VAULT "distribute()" --rpc-url $RPC --chain 196 --account <keystore name>
```

### From the OKLink page

Each vault is a minimal proxy of the vault implementation [`0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881`](https://www.oklink.com/xlayer/address/0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881). Once the implementation's source is verified on OKLink (still to do, see [`docs/deployments.md`](docs/deployments.md)), open `https://www.oklink.com/xlayer/address/<vault>`, go to the contract tab, read the proxy's functions to see `state()` and `status()`, connect your wallet to write `poke()` or `distribute()`, and confirm in the wallet. Until then, any wallet that can send a transaction with custom data works: send 0 OKB to the vault on X Layer (chain 196) with the data `0x18178358` for `poke()` or `0xe4fc6b6d` for `distribute()`.
