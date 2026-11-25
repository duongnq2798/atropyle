# Static analysis of the contracts

This page lists every finding that Slither and `forge lint` report on the Atropyle contracts, with its triage.
`forge lint` runs only its High, Medium and Low lints by default; this page also covers its Info, Gas and Code-size
lints. It was written on 25 November 2026 (UTC) against `contracts/src` at commit `6fc1e2f`. The source in
`contracts/src` last changed in commit `40f3ba0` (19 November 2026), before the mainnet deployment.

## Summary

- **No finding is a true positive that can lose or lock funds.** No finding is rated Medium or High after triage.
- Slither reports 42 results. 29 of them touch `contracts/src` and are triaged one by one below (S-01 to S-29). The
  other 13 are only in OpenZeppelin Contracts under `contracts/lib`; `contracts/slither.config.json` hides them, and
  they are listed in [Dependency-only results](#dependency-only-results) (D-01 to D-13).
- `forge lint` as configured reports nothing on `contracts/src`. By default it runs only its High, Medium and Low
  lints (`severity = ["high", "medium", "low"]` in `forge config`). At those severities there are 48 findings
  (F-01 to F-48): 13 `unsafe-typecast` findings that `contracts/foundry.toml` excludes, and 35 findings that inline
  `forge-lint` comments in the deployed source suppress. Its Info, Gas and Code-size lints report 33 more notes
  (F-49 to F-81). All 81 are triaged here.
- CI runs both tools on every push, `forge lint` at all six severities. It fails on a finding that is not in this
  triage and on a triaged finding that is no longer reported. See [CI](#ci).

| Tool and scope                                         | Findings | True positive        | False positive | Accepted by design |
| ------------------------------------------------------ | -------: | -------------------- | -------------: | -----------------: |
| Slither, `contracts/src`                               |       29 | 3, all Informational |              8 |                 18 |
| Slither, `contracts/lib` only                          |       13 | 0                    |              1 |                 12 |
| `forge lint`, High, Medium and Low, `contracts/src`    |       48 | 0                    |             19 |                 29 |
| `forge lint`, Info, Gas and Code-size, `contracts/src` |       33 | 7, all Informational |              0 |                 26 |

Severity is our assessment after triage, not the tool's impact column:

- **None**: the finding does not describe a defect in this code.
- **Informational**: true, with no security impact (gas, indexing, style).
- **Low**: real behaviour with a bounded effect, accepted by design and described here.

The deployed contracts cannot be upgraded. A mitigation therefore never changes their code: it lives in the SDK, the
UI or the docs, and each entry says which.

## What was analysed

The analysed source is the deployed code. The runtime bytecode compiled from `contracts/src` with the settings in
`contracts/foundry.toml` is identical to the code on X Layer, read with `eth_getCode`:

| Contract                         | Address                                      | Runtime size | Result                         |
| -------------------------------- | -------------------------------------------- | -----------: | ------------------------------ |
| `AtropyleVault` (implementation) | `0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881` | 15,516 bytes | identical                      |
| `AtropyleFactory`                | `0x7eCbBECA8F90A868A12aF48B766264bf9c87a651` |  4,039 bytes | identical, 4 immutables masked |

Read at block 76825358 (25 November 2026, 08:13:14 UTC) on `https://rpc.xlayer.tech` and at block 76825359 on
`https://xlayerrpc.okx.com`. The keccak256 of the compiled vault runtime code is
`0x22ce405e40ec5aa22c21157895e576701f5bcba3339167a7fda52cc122b1af6f`, the `vaultImplCodehash` in
[`deployments/xlayer.json`](../../deployments/xlayer.json), which `atropyle verify --vault` also checks on chain.

Slither analyses `contracts/src` and the OpenZeppelin files it imports (16 contracts). Its Foundry integration skips
`contracts/test` and `contracts/script`, which are not deployed. `forge lint` was run on `contracts/src` at all six of
its severities (High, Medium, Low, Info, Gas and Code-size). As configured, the whole project (`forge lint` with no
path) reports nothing either. At the Info, Gas and Code-size severities, the whole project also has notes in
`contracts/test` and `contracts/script`; they are not deployed, so this page does not triage them.

### Tool versions

| Tool                         | Version                                          | Where it comes from                                              |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Foundry (`forge`)            | 1.9.0, commit `6056c58`, built 2 November 2026   | `forge --version`; CI pins `v1.9.0`                              |
| solc                         | 0.8.24+commit.e11b9ed9                           | `solc_version` in `contracts/foundry.toml`; installed by Foundry |
| Slither                      | `slither-analyzer` 0.11.6 (PyPI, 28 July 2026)   | `uvx --from slither-analyzer==0.11.6`                            |
| crytic-compile               | 0.4.2 (PyPI, 28 July 2026)                       | `uvx --with crytic-compile==0.4.2`                               |
| Slither's other dependencies | PyPI as of 25 November 2026, 00:00 UTC           | `uvx --exclude-newer 2026-11-25T00:00:00Z`                       |
| Python                       | 3.12 (3.12.13 for this run)                      | `uvx --python 3.12`; CI uses `actions/setup-python` with 3.12    |
| uv                           | 0.11.8                                           | CI: `pip install uv==0.11.8`                                     |
| OpenZeppelin Contracts       | v5.0.2                                           | `contracts/foundry.lock`                                         |

`--exclude-newer` makes uv ignore every package version uploaded after that time, so the transitive dependencies of
Slither resolve the same way on every run. For this run they included web3 7.16.0, eth-abi 6.0.0, solc-select 1.2.0,
prettytable 3.19.0, packaging 26.4 and pycryptodome 3.24.1.

Compiler settings: legacy (evmasm) pipeline, optimizer on with 200 runs, EVM version `shanghai`, no via-IR.

### Commands

Run from `contracts/` on a checkout with its submodules (`git submodule update --init --recursive`).

```bash
forge build

# forge lint as configured, which runs the High, Medium and Low lints: no output, exit code 0
forge lint src --deny warnings

# the lint that foundry.toml excludes: 13 unsafe-typecast warnings (F-01 to F-13)
forge lint src --only-lint unsafe-typecast

# the Info, Gas and Code-size lints, which forge lint does not run by default: 33 notes (F-49 to F-81)
forge lint src --severity info gas code-size

# Slither, with slither.config.json (exclude_dependencies): 29 results (S-01 to S-29)
uvx --exclude-newer 2026-11-25T00:00:00Z --python 3.12 --from slither-analyzer==0.11.6 --with crytic-compile==0.4.2 slither .

# Slither without the config: 42 results, the 29 above and D-01 to D-13
echo '{}' > /tmp/slither-empty.json
uvx --exclude-newer 2026-11-25T00:00:00Z --python 3.12 --from slither-analyzer==0.11.6 --with crytic-compile==0.4.2 slither . --config-file /tmp/slither-empty.json
```

The 35 findings that inline comments suppress show up in a scratch copy where the comments are neutralised and the
`[lint]` table is removed. The copy keeps the line numbers (GNU sed). The inline comments name only High, Medium and
Low lints, so at the other severities the copy reports the same 33 notes as `contracts/`:

```bash
rm -rf /tmp/atropyle-lint && cp -r . /tmp/atropyle-lint && cd /tmp/atropyle-lint
sed -i 's/forge-lint:/forge-lint-off:/g' src/*.sol src/*/*.sol
sed -i '/^\[lint\]/,/^$/d' foundry.toml
forge lint src   # 48 warnings, F-01 to F-48
forge lint src --severity high med low info gas code-size   # 81 findings, F-01 to F-81
```

Notes:

- Slither compiles through crytic-compile, which runs `forge clean` and then rebuilds only `src` and `lib` with build
  info (`forge build --build-info --skip ./test/** ./script/** --force`). Run `forge build` again before `forge test`.
- `slither.config.json` sets `exclude_dependencies`, which hides a result only when every element of it is in a
  dependency (a path with a `lib` directory). It does not use `filter_paths`, which hides a result when any element
  matches: that would also have hidden S-26, which names files in `src` and in `lib`. Nothing in `src` is silenced:
  there is no `slither-disable` comment, and the run with the config keeps all 29 results that the run without it
  reports for `src`.
- Run Slither on a checkout with LF line endings, as CI has. With CRLF line endings, Slither 0.11.6 reports some lines
  in `lib` shifted: D-01 at `Clones.sol:29-36` instead of `30-37`, and S-26, which names files in `src` and in `lib`,
  with other lines, so the gate counts it as new and the baseline entry as gone. The gate's slither mode therefore fails
  first if a `.sol` file under `src` or `lib` has CRLF. On Windows, `core.autocrlf=true` writes CRLF in the submodules,
  where this repository's `.gitattributes` (`eol=lf`) does not apply. Before running Slither there, set
  `core.autocrlf false` in the submodules and check them out again, from the repository root:

  ```bash
  git -C contracts submodule foreach --recursive 'git config core.autocrlf false && git rm -rq --cached . && git reset -q --hard'
  ```

## Slither findings in `contracts/src`

Each group gives the findings, then the reasoning and the mitigation. Locations are `file:line` in `contracts/src`.
Impact and confidence are Slither's.

### divide-before-multiply

| ID   | Tool                           | Location                                          | Verdict        | Severity |
| ---- | ------------------------------ | ------------------------------------------------- | -------------- | -------- |
| S-01 | Slither (Medium / Medium)      | `vault/VaultDistribution.sol:69`, in `_split20`   | False positive | None     |
| F-47 | forge lint                     | `vault/VaultDistribution.sol:69:55`               | False positive | None     |

Reasoning: `(avail / BPS) * heir.bps + ((avail % BPS) * heir.bps) / BPS` is exactly `floor(avail * bps / BPS)`.
Write `avail = q * BPS + r` with `0 <= r < BPS`. Then `avail * bps / BPS = q * bps + r * bps / BPS`, and `q * bps` is
an integer, so the floor is `q * bps + floor(r * bps / BPS)`, which is what the line computes. Splitting the division
loses no precision and cannot overflow: `q * bps <= avail` because `bps <= BPS`, and `r * bps < 10^8`. The shares of
the first `n - 1` heirs add up to at most `avail * (sum of their bps) / BPS <= avail`, so `avail - sent` for the last
heir (`vault/VaultDistribution.sol:69`) cannot underflow, and the rounding remainder goes to the last heir. Covered by
`test_splitsByBpsWithRemainderToLastHeir` (`contracts/test/VaultDistribution.t.sol:96`).

Mitigation: none needed.

### incorrect-equality

| ID   | Tool                    | Location                                                     | Verdict        | Severity |
| ---- | ----------------------- | ------------------------------------------------------------ | -------------- | -------- |
| S-02 | Slither (Medium / High) | `AtropyleVault.sol:217`, `state == RELEASED_RECOVER` in `distribute` | False positive | None     |
| S-03 | Slither (Medium / High) | `AtropyleVault.sol:270`, `s == RECOVERY` in `_evaluate`      | False positive | None     |
| S-04 | Slither (Medium / High) | `AtropyleVault.sol:292`, `n == RECOVERY` in `_advance`       | False positive | None     |

Reasoning: the detector flags strict equality on values that an attacker might steer, such as balances or values
derived from `block.timestamp`. These comparisons test a state code against a constant. The state only ever holds one
of the five canonical codes: `_evaluate` reverts with `BadPolicyOutput` on any other circuit output
(`AtropyleVault.sol:285`). Exact equality is the intended meaning. Covered by `test_badPolicyOutputReverts`
(`contracts/test/AtropyleVault.t.sol:518`) and `invariant_I6_stateIsCanonicalAndMatchesStep`
(`contracts/test/Invariant.t.sol:323`).

Mitigation: none needed.

### missing-zero-check

| ID   | Tool                  | Location                                                   | Verdict        | Severity |
| ---- | --------------------- | ---------------------------------------------------------- | -------------- | -------- |
| S-05 | Slither (Low / Medium) | `AtropyleVault.sol:97`, `owner_` written at line 101      | False positive | None     |
| F-20 | forge lint            | `AtropyleVault.sol:97:25`, `owner_`                        | False positive | None     |
| F-18 | forge lint            | `AtropyleFactory.sol:43:17`, `vaultImpl_`                  | False positive | None     |
| F-19 | forge lint            | `AtropyleFactory.sol:43:37`, `cpu_`                        | False positive | None     |

Reasoning: the factory calls `initialize` with `msg.sender` as the owner (`AtropyleFactory.sol:88`), which is never
zero. The implementation locks itself in its constructor (`AtropyleVault.sol:87-89`) and a clone can be initialized
once (`AtropyleVault.sol:98-99`; `test_implementationAndCloneCannotBeReinitialized`,
`contracts/test/AtropyleFactory.t.sol:342`). In the factory constructor, `vaultImpl_` and `cpu_` are rejected when
they have no code, which also rejects the zero address, and `treasury_` is compared with zero
(`AtropyleFactory.sol:44`).

A related property, not a defect: anyone can deploy their own EIP-1167 clone of the implementation and initialize it
with any owner, naming themselves as the factory. That clone has the same runtime code as a real vault. It is not in
`factory.isVault`, it is not in the factory's role index, and it can move nothing unless the named owner approves
tokens to its address.

Mitigation, already in the SDK: `prepare` refuses any vault that the deployment's factory did not create
(`packages/sdk/src/prepare/actions.ts:263-274`), `vault.verify` checks `factory.isVault` first
(`packages/sdk/src/verify/vault.ts:48-59`), and the event scan keeps only events from vaults that the factory's
`VaultCreated` names (`packages/sdk/src/read/scan.ts:94-107`). Approve tokens only to a vault for which
`factory.isVault` returns true.

### calls-loop

| ID   | Tool                   | Location                                                                    | Verdict            | Severity      |
| ---- | ---------------------- | --------------------------------------------------------------------------- | ------------------ | ------------- |
| S-06 | Slither (Low / Medium) | `AtropyleFactory.sol:56`, `decimals()` in the constructor loop              | Accepted by design | None          |
| F-14 | forge lint             | `AtropyleFactory.sol:56:23`                                                 | Accepted by design | None          |
| S-07 | Slither (Low / Medium) | `AtropyleVault.sol:330`, `factory.index` from `setHeirs` and `_indexHeirs`  | Accepted by design | Informational |
| S-08 | Slither (Low / Medium) | `AtropyleVault.sol:330`, `factory.index` from `setGuardians` and `_indexGuardians` | Accepted by design | Informational |
| F-15 | forge lint             | `AtropyleVault.sol:330:9`                                                   | Accepted by design | Informational |
| S-09 | Slither (Low / Medium) | `vault/VaultDistribution.sol:104`, ERC-721 `safeTransferFrom` in the sweep  | Accepted by design | Low           |
| F-16 | forge lint             | `vault/VaultDistribution.sol:104:13`                                        | Accepted by design | Low           |
| S-10 | Slither (Low / Medium) | `vault/VaultDistribution.sol:115`, ERC-1155 `safeTransferFrom` in the sweep | Accepted by design | Low           |
| F-17 | forge lint             | `vault/VaultDistribution.sol:115:13`                                        | Accepted by design | Low           |

Reasoning for S-06 and F-14: the loop runs once, at deployment, over the deployer's own list of fee tokens. The
deployment has already succeeded (factory block 76567034 in `deployments/xlayer.json`).

Reasoning for S-07, S-08 and F-15: the callee is the factory that created the clone, fixed at `initialize`
(`AtropyleVault.sol:100`). For a registered vault, `index` cannot revert: the `isVault` check passes and the rest is
storage writes (`AtropyleFactory.sol:100-105`). The loops are bounded by 5 heirs and 5 guardians
(`vault/VaultConfig.sol:41-42`).

Reasoning for S-09, S-10, F-16 and F-17: the sweep calls the token contracts that the owner listed, so a token or a
contract heir may be hostile. Each call is isolated:

- `try`/`catch` turns a revert into a `TransferFailed` event and the sweep goes on
  (`vault/VaultDistribution.sol:104-108`, `:115-119`).
- Each call has a gas cap: 100,000 for views, 300,000 for an ERC-20 `transferFrom`, 500,000 for an NFT transfer
  (`vault/VaultDistribution.sol:20-22`). `_requireGas` reverts the whole sweep unless the full cap can be forwarded
  (`vault/VaultDistribution.sol:155-157`), so a caller cannot choose a gas amount that makes one recipient's transfer
  fail while the sweep goes on.
- Before an NFT transfer, static calls check that the owner still holds the item and the vault is approved
  (`vault/VaultDistribution.sol:102`, `:112-113`). An address without code answers 0 to these checks, so the transfer
  call is never made to it.
- The ERC-20 path (`_send20`) and every view copy at most 32 bytes of returndata (`vault/VaultDistribution.sol:88-92`,
  `:143-147`).

A hostile asset can waste at most its caps. With at most 20 assets and 5 heirs (`vault/VaultConfig.sol:41`, `:43`),
the capped external calls of one sweep add up to at most 20 × (2 × 100,000 + 5 × 300,000) = 34,000,000 gas, plus the
vault's own work. An ERC-20 split between 5 heirs is the most expensive kind of asset. The X Layer block gas limit
read at block 76825358 (25 November 2026, 08:13:14 UTC) was 210,000,000, so a sweep in which every asset is hostile
still fits in one block. A lower per-transaction cap in a wallet or an RPC was not checked. With well-behaved tokens,
a sweep of 20 assets to 5 heirs measured 3,385,904 gas (`test_worstCaseGasUnderSixMillion`, as recorded in
`contracts/README.md`). Hostile tokens and recipients are covered by `contracts/test/VaultDistribution.t.sol:225-506`
(blacklisted heir, contract heir without a receiver, returndata bombs, gas burners, too little gas).

A failed ERC-20 share stays in the owner's wallet. The next `distribute()` call splits the balance that is still
approved and held, by the same bps, among all heirs (`vault/VaultDistribution.sol:62-73`).

Mitigation: `coverage()` (`vault/VaultDistribution.sol:36-45`) reports, per asset, what the vault could move right
now, and the app shows it. The heir behaviour above is documented here.

### reentrancy-benign

| ID   | Tool                   | Location                                                                  | Verdict            | Severity      |
| ---- | ---------------------- | ------------------------------------------------------------------------- | ------------------ | ------------- |
| S-11 | Slither (Low / Medium) | `AtropyleFactory.sol:84` fee transfer, then `isVault` written at line 87  | Accepted by design | Informational |

Reasoning: the external call is `safeTransferFrom` on a fee token fixed at construction (USD₮0, USDC and USDG, listed
in `deployments/xlayer.json`). All three are upgradeable proxies, so their issuers can change their code: USD₮0 and
USDG have an implementation in the EIP-1967 slot, and USDC in the older ZeppelinOS slot
(`keccak256("org.zeppelinos.proxy.implementation")`), read with `eth_getStorageAt` at block 76825358 (25 November
2026, 08:13:14 UTC). The triage therefore does not assume that the tokens have no hooks. The factory has two state-changing functions. A call back into it during the transfer can call `createVault`,
which charges its own fee and creates its own clone under its own caller's salt, or `index`, which reverts for any
caller that is not a registered vault (`AtropyleFactory.sol:101`). The state written after the call, `isVault[vault]`, concerns an address
that has no code yet. `paidCount` is incremented before the call (`AtropyleFactory.sol:83`).

Mitigation: none needed.

### reentrancy-events

| ID   | Tool                   | Location                                                                           | Verdict            | Severity      |
| ---- | ---------------------- | ---------------------------------------------------------------------------------- | ------------------ | ------------- |
| S-12 | Slither (Low / Medium) | `AtropyleFactory.sol:91`, `VaultCreated` after the calls at lines 84 and 88       | Accepted by design | Informational |
| F-32 | forge lint             | `AtropyleFactory.sol:91:9`                                                         | Accepted by design | Informational |
| S-13 | Slither (Low / Medium) | `AtropyleVault.sol:115`, `Alive` after the `index` calls of lines 111-113          | Accepted by design | Informational |
| F-33 | forge lint             | `AtropyleVault.sol:115:9`                                                          | Accepted by design | Informational |
| F-34 | forge lint             | `AtropyleVault.sol:132:9`, `ConfigUpdated(1)` after `_indexHeirs`                  | Accepted by design | Informational |
| F-35 | forge lint             | `AtropyleVault.sol:149:9`, `ConfigUpdated(2)` after `_indexGuardians`              | Accepted by design | Informational |
| S-14 | Slither (Low / Medium) | `vault/VaultDistribution.sol:47-60`, sweep events after earlier calls in the loop  | Accepted by design | Informational |
| S-15 | Slither (Low / Medium) | `vault/VaultDistribution.sol:105`, `:107`, after the ERC-721 call                  | Accepted by design | Informational |
| S-16 | Slither (Low / Medium) | `vault/VaultDistribution.sol:116`, `:118`, after the ERC-1155 call                 | Accepted by design | Informational |
| F-36 | forge lint             | `vault/VaultDistribution.sol:78:13`                                                | Accepted by design | Informational |
| F-37 | forge lint             | `vault/VaultDistribution.sol:95:13`                                                | Accepted by design | Informational |
| F-38 | forge lint             | `vault/VaultDistribution.sol:97:13`                                                | Accepted by design | Informational |
| F-39 | forge lint             | `vault/VaultDistribution.sol:105:13`                                               | Accepted by design | Informational |
| F-40 | forge lint             | `vault/VaultDistribution.sol:107:13`                                               | Accepted by design | Informational |
| F-41 | forge lint             | `vault/VaultDistribution.sol:116:13`                                               | Accepted by design | Informational |
| F-42 | forge lint             | `vault/VaultDistribution.sol:118:13`                                               | Accepted by design | Informational |

Reasoning: every state-changing entry point of the vault carries `nonReentrant` (`AtropyleVault.sol:64-69`; used at
lines 120, 125, 138, 152, 159, 168, 178, 193 and 207), except `initialize`, which sets `_initialized` before any
external call (`AtropyleVault.sol:98-99`) and whose only callee is its caller, the factory. A token, an heir's receiver
hook or the factory therefore cannot re-enter the vault to change the state that these events describe, or to emit
vault events in between. A callee can only emit its own events, which carry its own address. In the factory, the
calls go to a clone of the fixed implementation and to a fee token (see S-11); `index` makes no external call.

Mitigation: the SDK keeps only events from vaults that the factory created (`packages/sdk/src/read/scan.ts:94-107`)
and reads a vault's state with view calls at one pinned block (`packages/sdk/src/read/snapshot.ts:72`) instead of
rebuilding it from the order of events.

### reentrancy-no-eth

| ID   | Tool       | Location                                                | Verdict        | Severity |
| ---- | ---------- | ------------------------------------------------------- | -------------- | -------- |
| F-43 | forge lint | `AtropyleVault.sol:330:9`, call before `_locked` is set | False positive | None     |

Reasoning: `_index` is reached from `initialize`, which takes no lock, and from `setHeirs` and `setGuardians`, which
do. `initialize` runs once (`AtropyleVault.sol:98-99`) and calls only its own caller, the factory
(`AtropyleVault.sol:100`), whose `index` makes no external call (`AtropyleFactory.sol:100-105`).

Mitigation: none needed.

### timestamp and block-timestamp

| ID   | Tool                   | Location                                                                     | Verdict            | Severity |
| ---- | ---------------------- | ---------------------------------------------------------------------------- | ------------------ | -------- |
| S-19 | Slither (Low / Medium) | `AtropyleVault.sol:250`, Drill expiry in `_expired`                          | Accepted by design | Low      |
| F-44 | forge lint             | `AtropyleVault.sol:250:25`                                                   | Accepted by design | Low      |
| S-20 | Slither (Low / Medium) | `AtropyleVault.sol:270-281`, the `windowDone` input in `_evaluate`           | Accepted by design | Low      |
| F-45 | forge lint             | `AtropyleVault.sol:280:41`                                                   | Accepted by design | Low      |
| S-21 | Slither (Low / Medium) | `AtropyleVault.sol:290-305`, branches on the circuit's outputs in `_advance` | Accepted by design | Low      |
| S-22 | Slither (Low / Medium) | `AtropyleVault.sol:315`, `idle` saturates at 15 periods                      | Accepted by design | Low      |
| F-46 | forge lint             | `AtropyleVault.sol:315:16`                                                   | Accepted by design | Low      |
| S-17 | Slither (Low / Medium) | `AtropyleVault.sol:217`, a state comparison in `distribute`                  | False positive     | None     |
| S-18 | Slither (Low / Medium) | `AtropyleVault.sol:225`, `:231`, in the view `status()`                      | False positive     | None     |
| S-23 | Slither (Low / Medium) | `AtropyleVault.sol:319`, `:322`, address comparisons in `_recBitmap`         | False positive     | None     |

Reasoning: Atropyle is a dead man's switch, so time is one of its inputs. The circuit sees time only through two
inputs computed by the vault: `idle`, the number of whole periods since the last proof of life
(`AtropyleVault.sol:311-316`), and `windowDone`, whether the alarm window has passed (`AtropyleVault.sol:280`). A block
producer that skews timestamps can move these deadlines by the size of the skew. The shortest values allowed for a
real vault are a period of 1 day and a window of 3 days (`vault/VaultConfig.sol:45-46`), so a skew that matters would
have to be measured in days. A release always needs the window to pass after an alarm (`nextState` in
`circuits/src/model.ts`), and a proof of life during the window cancels the alarm: `checkIn`, any setter, or `poke`
or `distribute` sent by the owner (`_ownerAlive`, `AtropyleVault.sol:253-261`). Drill vaults accept 60-second
minimums (`vault/VaultConfig.sol:47`) and expire after 7 days (`AtropyleVault.sol:13`); like any vault, a Drill can
move what its owner approved to it.

S-17, S-18 and S-23 are false positives. S-17 compares the state code (see S-02). S-18 is in a view function, which
changes nothing. S-23 compares addresses: no value there is derived from `block.timestamp`; Slither's taint analysis
reaches them through state written in the same functions as the timestamps.

Mitigation: `status()` returns each deadline (`lateAt`, `windowEndsAt`, `expiresAt`; `AtropyleVault.sol:229-233`), and
the app shows them as times derived from block timestamps. No code change is possible or needed.

### assembly

| ID   | Tool                           | Location                                               | Verdict            | Severity      |
| ---- | ------------------------------ | ------------------------------------------------------ | ------------------ | ------------- |
| S-24 | Slither (Informational / High) | `vault/VaultDistribution.sol:88-92`, in `_send20`      | Accepted by design | Informational |
| F-51 | forge lint (Info)              | `vault/VaultDistribution.sol:88:9`, `inline-assembly`  | Accepted by design | Informational |
| S-25 | Slither (Informational / High) | `vault/VaultDistribution.sol:143-147`, in `_viewWord`  | Accepted by design | Informational |
| F-52 | forge lint (Info)              | `vault/VaultDistribution.sol:143:9`, `inline-assembly` | Accepted by design | Informational |

Reasoning: both blocks are marked `memory-safe` and write only to the scratch space at `0x00`. They copy at most 32
bytes of returndata, so a token that returns a huge payload costs the vault nothing extra, and they use the gas caps
described under calls-loop. `_send20` counts a transfer as done only when the call did not revert and returned either
no data (the token has code, checked at line 77) or a first word equal to 1 (line 94). When a call returns 1 to 31
bytes, the scratch word can hold stale bytes, but both checks require at least 32 bytes of returndata (line 94 and
line 145) before the word is used. Covered by `test_tokenWithoutReturnValue`, `test_tokenReturningFalseFailsAndTheSweepGoesOn`,
`test_garbageTokenNeverReverts`, `test_shortViewReturnCountsAsZero` and the two returndata bomb tests
(`contracts/test/VaultDistribution.t.sol:154`, `:168`, `:282`, `:290`, `:352`, `:370`).

Mitigation: none needed.

### pragma

| ID   | Tool                           | Location                                                  | Verdict            | Severity      |
| ---- | ------------------------------ | --------------------------------------------------------- | ------------------ | ------------- |
| S-26 | Slither (Informational / High) | `pragma solidity 0.8.24` in `src`, `^0.8.20` in OpenZeppelin | Accepted by design | Informational |

Reasoning: one compiler, solc 0.8.24, builds everything (`solc_version` in `contracts/foundry.toml`). The known bugs of
that compiler are triaged in [Compiler](#compiler).

Mitigation: none needed.

### unindexed-event-address

| ID   | Tool                           | Location                                                | Verdict       | Severity      |
| ---- | ------------------------------ | ------------------------------------------------------- | ------------- | ------------- |
| S-27 | Slither (Informational / High) | `AtropyleVault.sol:50`, `AlarmRaised(uint8, address)`   | True positive | Informational |
| F-49 | forge lint (Info)              | `AtropyleVault.sol:50:11`, `event-fields`               | True positive | Informational |
| S-28 | Slither (Informational / High) | `AtropyleVault.sol:52`, `Released(uint8, address)`      | True positive | Informational |
| F-50 | forge lint (Info)              | `AtropyleVault.sol:52:11`, `event-fields`               | True positive | Informational |

Reasoning: these events cannot be filtered by their target address through log topics. That is a convenience for
indexers, not a security property.

Mitigation: readers filter by the emitting vault and decode the data (`packages/sdk/src/read/events.ts:72-73`). To see
the recovery target of a vault, read `status().recoveryTarget`.

### cache-array-length

| ID   | Tool                         | Location                                                 | Verdict       | Severity      |
| ---- | ---------------------------- | -------------------------------------------------------- | ------------- | ------------- |
| S-29 | Slither (Optimization / High) | `vault/VaultConfig.sol:99`, `_assets.length` in `_setHeirs` | True positive | Informational |

Reasoning: the loop reads the length of `_assets` from storage on each of at most 20 iterations
(`vault/VaultConfig.sol:43`). After the first read the slot is warm, and a warm `SLOAD` costs 100 gas (EIP-2929), so
the waste is at most about 2,000 gas per `setHeirs` call.

Mitigation: none.

## forge lint findings without a Slither match

### unsafe-typecast

These 13 findings are excluded project-wide by `exclude_lints = ["unsafe-typecast"]` in `contracts/foundry.toml`. The
CI gate pins their locations in `contracts/static-analysis.baseline.json`, so a new one fails the job.

| ID   | Location                       | Cast                                         | Verdict        | Severity |
| ---- | ------------------------------ | -------------------------------------------- | -------------- | -------- |
| F-01 | `AtropyleVault.sol:105:33`     | `uint64(block.timestamp + DRILL_LIFETIME)`   | False positive | None     |
| F-02 | `AtropyleVault.sol:106:21`     | `uint64(block.timestamp)`, `lastAlive`       | False positive | None     |
| F-03 | `AtropyleVault.sol:115:20`     | `uint64(block.timestamp)`, `Alive` event     | False positive | None     |
| F-04 | `AtropyleVault.sol:171:21`     | `uint8(1 << i)`, guardian bit                | False positive | None     |
| F-05 | `AtropyleVault.sol:254:21`     | `uint64(block.timestamp)`, `lastAlive`       | False positive | None     |
| F-06 | `AtropyleVault.sol:260:20`     | `uint64(block.timestamp)`, `Alive` event     | False positive | None     |
| F-07 | `AtropyleVault.sol:291:23`     | `uint64(block.timestamp)`, `alarmAt`         | False positive | None     |
| F-08 | `AtropyleVault.sol:301:26`     | `uint64(block.timestamp)`, `releasedAt`      | False positive | None     |
| F-09 | `AtropyleVault.sol:315:36`     | `uint8(periods)`                             | False positive | None     |
| F-10 | `AtropyleVault.sol:322:59`     | `uint8(1 << i)`, recovery vote bit           | False positive | None     |
| F-11 | `PolicyCodec.sol:46:23`        | `uint8(w)`                                   | False positive | None     |
| F-12 | `PolicyCodec.sol:47:23`        | `uint8(w >> 8)`                              | False positive | None     |
| F-13 | `PolicyCodec.sol:48:23`        | `uint8(w >> 16)`                             | False positive | None     |

Reasoning: a `uint64` of seconds overflows after about 5.8 × 10^11 years, and `DRILL_LIFETIME` adds 7 days. The bit
index `i` is a guardian index below 5 (`vault/VaultConfig.sol:42`, `:110`), so `1 << i` is at most 16. `periods` is
at most 15 where it is cast (`AtropyleVault.sol:315`). `PolicyCodec.packWord` takes the three bytes of a 24-bit input
word on purpose, little-endian, as the circuit's wire format requires (`PolicyCodec.sol:5`, `:44-49`).

Mitigation: none needed.

### require-revert-in-loop

| ID   | Location                                 | Verdict            | Severity |
| ---- | ---------------------------------------- | ------------------ | -------- |
| F-21 | `AtropyleFactory.sol:55:56`              | Accepted by design | None     |
| F-22 | `AtropyleFactory.sol:57:34`              | Accepted by design | None     |
| F-23 | `vault/VaultConfig.sol:92:96`            | Accepted by design | None     |
| F-24 | `vault/VaultConfig.sol:94:43`            | Accepted by design | None     |
| F-25 | `vault/VaultConfig.sol:100:39`           | Accepted by design | None     |
| F-26 | `vault/VaultConfig.sol:113:79`           | Accepted by design | None     |
| F-27 | `vault/VaultConfig.sol:115:35`           | Accepted by design | None     |
| F-28 | `vault/VaultConfig.sol:139:70`           | Accepted by design | None     |
| F-29 | `vault/VaultConfig.sol:140:52`           | Accepted by design | None     |
| F-30 | `vault/VaultConfig.sol:142:63`           | Accepted by design | None     |
| F-31 | `vault/VaultDistribution.sol:156:55`     | Accepted by design | None     |

Reasoning: F-21 to F-30 are input validation. The factory constructor and the configuration setters reject the whole
input on its first invalid entry, which is the intent. F-31 is `_requireGas`, reached inside the sweep loop: aborting
the whole sweep when the caller did not provide enough gas is its purpose (`vault/VaultDistribution.sol:150-157`; see
calls-loop). Covered by `test_tooLittleGasForAViewRevertsInsteadOfSkipping`,
`test_tooLittleGasForAnErc20TransferReverts`, `test_tooLittleGasForAnNftTransferReverts` and
`test_calleeAlwaysGetsItsFullGasCap` (`contracts/test/VaultDistribution.t.sol:463`, `:473`, `:481`, `:508`).

Mitigation: none needed.

### missing-events-access-control

| ID   | Location                       | Verdict        | Severity |
| ---- | ------------------------------ | -------------- | -------- |
| F-48 | `vault/VaultConfig.sol:120:9`  | False positive | None     |

Reasoning: `_guardians` changes without an event inside the internal setter, but every external path that reaches it
emits one: `setGuardians` emits `ConfigUpdated(2)` (`AtropyleVault.sol:149`) and a new vault is announced by
`VaultCreated` (`AtropyleFactory.sol:91`). Readers then read `guardians()`.

Mitigation: none needed.

## forge lint notes at the Info, Gas and Code-size severities

`forge lint` does not run these lints by default, so `forge lint src` does not show them. Run
`forge lint src --severity info gas code-size` to see all 33. No inline comment in `src` names one of these lints, and
`foundry.toml` does not exclude any of them. The CI gate pins their locations in
`contracts/static-analysis.baseline.json`. Four of them match a Slither finding and are triaged with it: F-49 and F-50
(`event-fields`) under [unindexed-event-address](#unindexed-event-address), F-51 and F-52 (`inline-assembly`) under
[assembly](#assembly). The other 29 follow.

### internal-function-used-once (Info)

| ID   | Location                 | Function      | Verdict            | Severity      |
| ---- | ------------------------ | ------------- | ------------------ | ------------- |
| F-53 | `PolicyCodec.sol:27:5`   | `toWord`      | Accepted by design | Informational |
| F-54 | `PolicyCodec.sol:44:5`   | `packWord`    | Accepted by design | Informational |
| F-55 | `PolicyCodec.sol:51:5`   | `pack`        | Accepted by design | Informational |
| F-56 | `PolicyCodec.sol:55:5`   | `encodeState` | Accepted by design | Informational |
| F-57 | `PolicyCodec.sol:68:5`   | `isCanonical` | Accepted by design | Informational |

Reasoning: `PolicyCodec` is the wire format of the policy circuit (`PolicyCodec.sol:4-5`), and each of these functions
is one named step of it. In `src`, the vault calls `encodeState` and `pack` once (`AtropyleVault.sol:282`) and
`isCanonical` once (`AtropyleVault.sol:285`), and `pack` calls `toWord` and `packWord` (`PolicyCodec.sol:52`). The
tests in `contracts/test` call each of the five directly, for example `contracts/test/PolicyModel.t.sol`, so the wire
format is tested step by step against the circuit model.

Mitigation: none needed.

### literal-instead-of-constant (Info)

| ID   | Location                   | Literal                                | Verdict            | Severity      |
| ---- | -------------------------- | -------------------------------------- | ------------------ | ------------- |
| F-58 | `AtropyleVault.sol:315:26` | `15`, the bound of `idle`              | Accepted by design | Informational |
| F-59 | `AtropyleVault.sol:315:31` | `15`, the saturated value of `idle`    | Accepted by design | Informational |
| F-60 | `PolicyCodec.sol:28:29`    | `0x0f`, `idle` mask in `toWord`        | Accepted by design | Informational |
| F-61 | `PolicyCodec.sol:28:59`    | `0x0f`, `threshold` mask in `toWord`   | Accepted by design | Informational |
| F-62 | `PolicyCodec.sol:28:94`    | `0x1f`, `inhVotes` mask in `toWord`    | Accepted by design | Informational |
| F-63 | `PolicyCodec.sol:29:36`    | `0x1f`, `recVotes` mask in `toWord`    | Accepted by design | Informational |
| F-64 | `PolicyCodec.sol:29:65`    | `0x07`, `k` mask in `toWord`           | Accepted by design | Informational |
| F-65 | `PolicyCodec.sol:35:28`    | `0x0f`, `idle` mask in `fromWord`      | Accepted by design | Informational |
| F-66 | `PolicyCodec.sol:36:40`    | `0x0f`, `threshold` mask in `fromWord` | Accepted by design | Informational |
| F-67 | `PolicyCodec.sol:37:39`    | `0x1f`, `inhVotes` mask in `fromWord`  | Accepted by design | Informational |
| F-68 | `PolicyCodec.sol:38:40`    | `0x1f`, `recVotes` mask in `fromWord`  | Accepted by design | Informational |
| F-69 | `PolicyCodec.sol:39:33`    | `0x07`, `k` mask in `fromWord`         | Accepted by design | Informational |

Reasoning: the masks are the widths of the input fields of the circuit, 4, 5 and 3 bits. Each one appears once in
`toWord` and once in `fromWord`, next to the shift that places its field, and the struct gives the bits of every field
(`PolicyCodec.sol:17-25`). `15` is the largest value of the 4-bit `idle` input, where `_idle` saturates, as the comment
above it says (`AtropyleVault.sol:313`). The literals read directly against the circuit's spec.

Mitigation: none needed.

### screaming-snake-case-immutable (Info)

| ID   | Location                     | Immutable   | Verdict            | Severity      |
| ---- | ---------------------------- | ----------- | ------------------ | ------------- |
| F-70 | `AtropyleFactory.sol:19:30`  | `vaultImpl` | Accepted by design | Informational |
| F-71 | `AtropyleFactory.sol:20:30`  | `cpu`       | Accepted by design | Informational |
| F-72 | `AtropyleFactory.sol:21:30`  | `policyId`  | Accepted by design | Informational |
| F-73 | `AtropyleFactory.sol:22:30`  | `treasury`  | Accepted by design | Informational |

Reasoning: the four immutables are `public`, so their names are the getters of the factory's ABI (`vaultImpl()`,
`cpu()`, `policyId()`, `treasury()`). The SDK reads them by these names (`packages/sdk/src/verify/integrity.ts:43-46`).

Mitigation: none needed.

### asm-keccak256 (Gas)

| ID   | Location                     | Verdict       | Severity      |
| ---- | ---------------------------- | ------------- | ------------- |
| F-74 | `AtropyleFactory.sol:137:16` | True positive | Informational |

Reasoning: `_salt` hashes `abi.encode(owner, salt)` (`AtropyleFactory.sol:136-138`). Hashing the two words in inline
assembly would skip the memory allocation of `abi.encode` and save a little gas in each `createVault`
(`AtropyleFactory.sol:86`) and `predictVault` (`AtropyleFactory.sol:96`) call. The saving was not measured. It has no
security impact.

Mitigation: none.

### costly-loop (Gas)

| ID   | Location                    | Write                                            | Verdict            | Severity      |
| ---- | --------------------------- | ------------------------------------------------ | ------------------ | ------------- |
| F-75 | `AtropyleFactory.sol:59:13` | `earlyFee[t]` in the constructor                 | Accepted by design | Informational |
| F-76 | `AtropyleFactory.sol:60:13` | `fullFee[t]` in the constructor                  | Accepted by design | Informational |
| F-77 | `AtropyleVault.sol:258:13`  | `delete recVote[_guardians[i]]` in `_ownerAlive` | Accepted by design | Informational |

Reasoning: each iteration writes a different storage slot, the fee of one token or the recovery vote of one guardian,
so the writes cannot be merged into one. The factory loop ran once, at deployment (see S-06). The vault loop runs over
at most 5 guardians (`vault/VaultConfig.sol:42`), and clearing every recovery vote on a proof of life is its purpose
(`AtropyleVault.sol:253-261`).

Mitigation: none needed.

### unwrapped-modifier-logic (Code-size)

| ID   | Location                   | Modifier       | Verdict       | Severity      |
| ---- | -------------------------- | -------------- | ------------- | ------------- |
| F-78 | `AtropyleVault.sol:64:5`   | `nonReentrant` | True positive | Informational |
| F-79 | `AtropyleVault.sol:71:5`   | `notExpired`   | True positive | Informational |
| F-80 | `AtropyleVault.sol:76:5`   | `notReleased`  | True positive | Informational |
| F-81 | `AtropyleVault.sol:81:5`   | `onlyOwner`    | True positive | Informational |

Reasoning: the compiler copies a modifier's code into every function that uses it, so moving these checks into
internal functions would make the vault's runtime code smaller. That code is 15,516 bytes (see
[What was analysed](#what-was-analysed)), below the limit of 24,576 bytes set by EIP-170. Every vault is an EIP-1167
clone that delegates to the one implementation, so a smaller implementation would only lower the cost of its single
deployment. It has no security impact.

Mitigation: none.

## Dependency-only results

Slither reports these in OpenZeppelin Contracts v5.0.2, unmodified, under `contracts/lib/openzeppelin-contracts`.
`exclude_dependencies` hides them. Locations are relative to `contracts/lib/openzeppelin-contracts/contracts`.

| ID   | Detector                         | Location                                                  | Verdict            | Severity      |
| ---- | -------------------------------- | --------------------------------------------------------- | ------------------ | ------------- |
| D-01 | assembly (Informational)         | `proxy/Clones.sol:30-37`, `clone`                         | Accepted by design | Informational |
| D-02 | assembly (Informational)         | `proxy/Clones.sol:52-59`, `cloneDeterministic`            | Accepted by design | Informational |
| D-03 | assembly (Informational)         | `proxy/Clones.sol:74-83`, `predictDeterministicAddress`   | Accepted by design | Informational |
| D-04 | assembly (Informational)         | `utils/Address.sol:151-154`, `_revert`                    | Accepted by design | Informational |
| D-05 | solc-version (Informational)     | `pragma ^0.8.20` in 9 OpenZeppelin files                  | False positive     | None          |
| D-06 | low-level-calls (Informational)  | `utils/Address.sol:46`, `sendValue`                       | Accepted by design | Informational |
| D-07 | low-level-calls (Informational)  | `token/ERC20/utils/SafeERC20.sol:115`, `_callOptionalReturnBool` | Accepted by design | Informational |
| D-08 | low-level-calls (Informational)  | `utils/Address.sol:105`, `functionDelegateCall`           | Accepted by design | Informational |
| D-09 | low-level-calls (Informational)  | `utils/Address.sol:96`, `functionStaticCall`              | Accepted by design | Informational |
| D-10 | low-level-calls (Informational)  | `utils/Address.sol:87`, `functionCallWithValue`           | Accepted by design | Informational |
| D-11 | naming-convention (Informational) | `token/ERC20/extensions/IERC20Permit.sol:89`, `DOMAIN_SEPARATOR` | Accepted by design | Informational |
| D-12 | too-many-digits (Informational)  | `proxy/Clones.sol:33`, the clone bytecode constant        | Accepted by design | Informational |
| D-13 | too-many-digits (Informational)  | `proxy/Clones.sol:55`, the clone bytecode constant        | Accepted by design | Informational |

Reasoning: these are deliberate patterns of the library (EIP-1167 clone code, `Address` helpers, the EIP-2612 name
`DOMAIN_SEPARATOR`). The factory uses `Clones` and `SafeERC20`; nothing in `src` uses `delegatecall` or sends native
value. D-05 names three compiler bugs (VerbatimInvalidDeduplication, FullInlinerNonExpressionSplitArgumentEvaluationOrder,
MissingSideEffectsOnSelectorAccess) that were fixed in solc 0.8.23, 0.8.21 and 0.8.21, per the Solidity project's
`docs/bugs.json`. The compiler in use, 0.8.24, does not have them.

## Compiler

Slither's own table of compiler bugs lists none for 0.8.24 (`slither/utils/buggy_versions.py` in 0.11.6), so its
`solc-version` detector stays silent on `src`. The Solidity project's list is newer. Its `docs/bugs_by_version.json`
on the `develop` branch, fetched on 25 November 2026, lists seven bugs for 0.8.24:

| Bug                                                  | Fixed in | Affects this code         | Why                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OverlappingRecursiveStorageStructCopyCorruption      | 0.8.39   | No                        | Needs a struct that contains an array of its own type. None of the structs in `src` is recursive.                                                                                                                                                         |
| OverlappingRecursiveStorageStructCopyCorruptionViaIR | 0.8.39   | No                        | via-IR only.                                                                                                                                                                                                                                              |
| YulOptimizerKnowledgeBaseStaleBookkeeping            | 0.8.38   | Not ruled out, unlikely   | See below.                                                                                                                                                                                                                                                |
| MemoryByteArrayElementDeleteClearsWholeWord          | 0.8.37   | No                        | Needs `delete` on one element of a `bytes` value in memory. Every `delete` in `src` is on storage (`AtropyleVault.sol:258`, `vault/VaultConfig.sol:102`, `:145`).                                                                                         |
| SpillSlotCollisionAcrossMutualRecursion              | 0.8.37   | No                        | via-IR only.                                                                                                                                                                                                                                              |
| UnsoundSpillInMutualRecursion                        | 0.8.36   | No                        | via-IR only.                                                                                                                                                                                                                                              |
| LostStorageArrayWriteOnSlotOverflow                  | 0.8.32   | No                        | Needs a storage array that wraps past the last storage slot. The vault's arrays start at keccak256 of slots 2, 3 and 4, each more than 10^76 slots before the end, and hold at most 5, 5 and 60 slots. The factory's per-account lists start at hash-derived slots; putting one that close to the end would take a hash preimage. |

YulOptimizerKnowledgeBaseStaleBookkeeping: the Solidity team's advisory of 22 October 2026
(`blog.soliditylang.org`) rates it low. With the evmasm pipeline used here, only compiler-generated Yul utility
functions and inline assembly blocks that do not refer to Solidity variables can be affected. Both assembly blocks in
`src` refer to Solidity variables (`vault/VaultDistribution.sol:88-92`, `:143-147`). The generated utility functions,
such as the ABI encoder and decoder, cannot be cleared by reading the source. The advisory reports that rebuilding
about 607,000 evmasm compilations from Sourcify with and without the fix produced no different bytecode; the
Atropyle contracts were not necessarily part of that set. The unit, fuzz, invariant and fork tests in `contracts/test`
run code built by the same compiler with the same settings. This item stays open until someone compares the generated
code with a fixed compiler.

## Beyond these tools

Static analysis of this repository does not cover:

- **The TapeOut processor.** Every transition comes from `cpu.step` (`AtropyleVault.sol:282`). `atropyle verify`
  checks that the processor's circuits sit behind a beacon whose owner is the zero address
  (`packages/sdk/src/verify/cpu.ts:73`) and that the on-chain netlists match `circuits/`.
- **Economic and social assumptions**, such as guardians who collude to reach the recovery quorum. The owner can cancel
  any alarm with a check-in during the window.

## CI

The `contracts` job in `.github/workflows/ci.yml` runs, after `forge build` and `forge test`:

1. `python static-analysis-gate.test.py`, the unit tests of the gate script below. It also checks that each D-xx
   location on this page starts and ends where the reported element does in the OpenZeppelin source.
2. `forge lint src --deny warnings`. It runs the High, Medium and Low lints and fails on any warning that the config
   and the inline comments in `src` leave. Those comments are part of the deployed source, so they are the baseline for
   35 findings.
3. `forge lint src --json --only-lint unsafe-typecast` and `forge lint src --json --severity info gas code-size`, then
   `python static-analysis-gate.py forge-lint` on both reports. It fails unless the two reports hold exactly F-01 to
   F-13 and F-49 to F-81, at their locations.
4. Slither with the pinned versions above, then `python static-analysis-gate.py slither`. It fails unless the report
   holds exactly S-01 to S-29, and before comparing, if a `.sol` file under `contracts/src` or `contracts/lib` has CRLF
   line endings (see the notes under [Commands](#commands)).

Both gates compare against `contracts/static-analysis.baseline.json`. A gate fails on:

- a finding that is not in the baseline;
- a baseline entry whose triage is still `untriaged` (see [Updating the baseline](#updating-the-baseline));
- a baseline entry that is no longer reported. The deployed source cannot change and every tool version is pinned, so
  this means a broken run, such as a compile that analysed nothing or an empty report;
- a triage ID of the baseline that this page does not name.

The Slither gate does not use Slither's own result ids: in 0.11.6, the reentrancy-events result for `_distribute`
(S-14) can list tied events in a different order from one run to the next, and its id was different in each of three
consecutive runs. The gate fingerprints a result by its detector and the sorted lines of its description instead,
which matched in all of these runs. Slither runs last because its compile cleans `contracts/out`. On the development
machine, one Slither run took between 4 and 20 seconds once uv had cached the tools; the first install took about 70
seconds. The time on GitHub's runners has not been measured yet.

To reproduce the CI gate locally, from `contracts/`:

```bash
python3 static-analysis-gate.test.py
forge lint src --deny warnings
forge lint src --json --only-lint unsafe-typecast > /tmp/forge-lint-typecast.jsonl
forge lint src --json --severity info gas code-size > /tmp/forge-lint-notes.jsonl
python3 static-analysis-gate.py forge-lint /tmp/forge-lint-typecast.jsonl /tmp/forge-lint-notes.jsonl
rm -f /tmp/slither.json
uvx --exclude-newer 2026-11-25T00:00:00Z --python 3.12 --from slither-analyzer==0.11.6 --with crytic-compile==0.4.2 slither . --fail-none --json /tmp/slither.json
python3 static-analysis-gate.py slither /tmp/slither.json
```

Slither does not overwrite an existing `--json` file, hence the `rm -f`.

## Updating the baseline

A change to `contracts/src` means a new deployment, so the baseline should only change with one, or with a new pinned
version of a tool. A new tool version also comes with a new `--exclude-newer` date. After such a change:

1. Run both tools and read every new finding.
2. Rewrite the baseline with `--write` (`python3 static-analysis-gate.py slither /tmp/slither.json --write`, and the
   same for `forge-lint` with both reports). Entries that are still reported keep their ID; new ones get `untriaged`,
   and entries that are no longer reported are dropped.
3. Triage each `untriaged` entry on this page, replace `untriaged` in the baseline with the next free ID, and update
   the counts in the summary. Until then the gate fails.
