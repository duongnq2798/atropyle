# Atropyle: contracts

A non-custodial inheritance and wallet recovery vault on X Layer (chainId 196). The `AtropylePolicy v1` circuit on the TapeOut processor `ATRO` decides every lifecycle transition of a vault through `step()`, and so every release of its assets. The Solidity code decides who receives how much (`src/vault/VaultDistribution.sol`). The vault implementation has no admin, pause, upgrade, `delegatecall` or `selfdestruct`; each vault is a minimal proxy (EIP-1167) of that one fixed implementation.

## Layout

| Path | Role |
|---|---|
| `src/AtropyleVault.sol` | The vault (an EIP-1167 clone), one per owner |
| `src/AtropyleFactory.sol` | Creates vaults, collects the fee, indexes roles |
| `src/vault/VaultConfig.sol` | Configuration and its constraints |
| `src/vault/VaultDistribution.sol` | Fault-tolerant distribution (blacklisting tokens, fee-on-transfer, no `bool` return) |
| `src/PolicyCodec.sol` | Bit format of the policy's state, inputs and outputs |
| `circuits/*.json` | Netlists generated from `../circuits`; do not edit by hand |
| `script/` | Deploy scripts 01–05 |
| `script/lib/` | The tape-out flow shared by the scripts and the fork tests |

## Commands

```bash
forge build --sizes
forge test
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
forge snapshot --no-match-test "invariant_|testFuzz_"
```

Compare with the recorded snapshot: `forge snapshot --no-match-test "invariant_|testFuzz_" --check --tolerance 1`. The three tests that read circuit files (`test_realTemplateRoundTrips`, `test_mockCpuSpeaksTheWireFormat`, `test_modelMatchesCircuitVectors`) vary in gas by about 0.3% with the length of the checkout's folder path, hence `--tolerance`. The line `ForkTest:setUp() (gas: 0)` in the snapshot is the fork test, skipped when `XLAYER_FORK_RPC` is not set.

Regenerate the netlists (at the repository root): `npm run export -w circuits`. The `export.test.ts` test fails when a file in `contracts/circuits/` drifts from the builder.

Exhaustive proof over 2^26 = 67,108,864 combinations: `npm run prove -w circuits` (about 88–112 seconds under `tsx` on a development machine; `npm test -w circuits` runs the same sweep in about 18 seconds).

## Measurements

| Item | Value | How it is measured |
|---|---|---|
| Gates of AtropylePolicy v1 (flattened) | 199 (196 NAND + 3 LATCH; its own layer 89 NAND + 3 LATCH + 3 REF, an 800-byte netlist) | `npm run export -w circuits`, `circuitInfo` on the fork |
| Gates of KofN5 / Ge4 | 41 / 25 | `circuitInfo` on the fork |
| Gas of one `step` (X Layer fork) | 624,406 | `ForkTest.test_stepGas` |
| Worst-case `distribute()` gas, 20 assets × 5 heirs | 3,385,904 | `test_worstCaseGasUnderSixMillion` (unit test, some slots already warm; budget < 6 million) |
| Runtime bytecode of Vault / Factory | 15,516 / 4,039 bytes (limit 24,576) | `forge build --sizes` |
| One Drill lifecycle on the fork (6 transactions) | 3,736,276 | `ForkTest.test_drillLifecycleGas`; each `poke`/`attestDeath`/`distribute` transaction costs about 0.66–0.78 million |
| Cost of creating the processor and 3 circuits | 0.14 BEM (0.1 `createCPU` + 4 mints × 0.01) + 0.0039 OKB tape-out fees (3 × 0.0013) | `ForkTest.test_tapeoutBudget` |
| Gas of each stage 01 / 02 / 03 / 04 / 05 | 845,944 / 989,095 / 852,598 / 4,553,395 / 1,104,004 | rehearsal on an anvil fork (section "Rehearsal") |

## Mainnet deployment

You sign every transaction yourself with a Foundry keystore. Never paste a private key into a command, a file or a chat. The deployer wallet needs at least 0.2 BEM and 0.02 OKB, and must be a plain wallet address (an EOA with no code, EIP-7702 code included): the processor mints ERC-1155 transistors straight to that wallet. A wallet upgraded to a smart account under EIP-7702 (for example through OKX Wallet) has code `0xef0100…`; if it went ahead, stage 02 would fail with `ERC1155InvalidReceiver` (`0x57f447ce`) after stage 01 had already spent 0.1 BEM and fixed the processor's creator to that wallet. So scripts 01, 02 and 03 stop at once with the error `DEPLOYER has code (EIP-7702 delegation?)` before they spend anything. Check beforehand, and check again between stages (a wallet can be upgraded halfway):

```bash
cast code $DEPLOYER --rpc-url xlayer   # must print 0x
```

### One command: `npm run deploy:mainnet`

`scripts/deploy-mainnet.ts` runs exactly the five stages in the table below, in order, from your terminal (run it at the repository root). Forge signs with the keystore and asks for the password itself. The script never sees a key or a password, and does not read the keyboard itself: the confirmation is read by a short child process, so forge's password prompt has a console of its own.

```bash
cast wallet new atropyle-deployer   # once: creates an encrypted keystore, sets a password, prints the address (not the key)
# send at least 0.2 BEM and 0.02 OKB to the address just printed
npm run deploy:mainnet -- --deployer 0x... --treasury 0x...
```

On Windows, Foundry installed from Git Bash is often only on Git Bash's PATH. PowerShell then reports `cast : The term 'cast' is not recognized`. Add it to the PATH of the open PowerShell window and run again:

```powershell
$env:Path += ";$env:USERPROFILE\.foundry\bin"
```

The script itself does not need this step. If `forge`/`cast` is not on the PATH, it uses `~/.foundry/bin` (and prints a line saying so). When neither place has them, the script stops and says plainly that Foundry is missing, rather than wrongly reporting a missing keystore.

Keep the file `~/.foundry/keystores/atropyle-deployer` and its password. The deployer wallet owns the circuits, and is also the wallet that signs the DeWEB publish later. To use an existing wallet instead of a new one, import it with `cast wallet import atropyle-deployer --interactive` (as in the section below). The fork rehearsal costs about 0.14 BEM and 0.004 OKB.

Before it sends anything, the script checks:

- the chainId is 196;
- `contracts/.env` sets no name that forge would read into the stages. Forge loads that file itself and fills every variable left empty, so `REPLACE_PROCESSOR`, the ids, `ETH_*`, `FOUNDRY_*` or `DAPP_*` there would leak in. The script reads only the variable names;
- the keystore exists;
- no role is a default anvil account;
- `DEPLOYER` is an EOA with no code and holds enough BEM and OKB;
- the treasury test on a fork passes (read-only, section "Check the treasury before stage 04");
- the keystore opens to exactly `DEPLOYER`: `cast wallet address --account atropyle-deployer` asks for the password once.

Then the script prints a summary (read the `TREASURY` line carefully: it is immutable after stage 04) and waits for you to type `deploy`. After that, forge asks for the password once per stage.

For each stage, the script does four things:

1. Writes `pending` (the stage and the current nonce of `DEPLOYER`) to `broadcast/atropyle-deploy/196/progress.json`.
2. Runs the forge script with `--account atropyle-deployer --broadcast --slow`. Forge's environment comes from the progress file: old variables in the shell (`ETH_*`, `FOUNDRY_*` and `DAPP_*` included) do not leak in.
3. Saves the values the stage printed in the progress file, with a copy of `run-latest.json`, then clears `pending`.
4. Reads the result back from the chain as in the section "Read back from the chain after each stage".

Run the same command again and the script resumes from the first missing stage. A stage that already has values is only read back, never sent again. At the end, the script writes `exports.env` and runs ForkTest (read-only) against the real deployment.

The script never resends on its own a stage that may have been partly sent:

- Forge fails, or you press Ctrl+C, after something was sent (the nonce changed, or forge's record has a new hash): `pending` is kept and the script stops. The next run stops there too. Look at `run-latest.json` and the receipts, add the stage's values to the progress file, and run again. To send the rest (each stage's notes say when that is safe), clear `pending` first.
- Forge fails before sending anything (wrong password, the simulation reverts): the script clears `pending` and tells you to run again.
- `broadcast/<script>/196/run-latest.json` exists while the progress file has no value for that stage (a manual run, or a lost progress file): the script stops.

Other flags:

- `--smoke-heir` defaults to `TREASURY`, and must differ from `DEPLOYER`.
- `--legacy` when the RPC refuses EIP-1559 transactions.
- A lost progress file after stage 01 is on chain: run the same command again with `--skip-balance-check`, because the wallet has spent 0.1 BEM and is below the 0.2 threshold. The forge scripts still check the exact amounts they need. Stage 01 reports that the wallet already has an Atropyle processor. The script asks, and you type `continue` to keep using that processor.
- `--rehearsal http://127.0.0.1:<port>` sends with `--unlocked`, only to an anvil with chainId 31337 (section "Rehearsal"), and skips the keystore check. Its record lives in `broadcast/atropyle-deploy/31337/`, so the cleanup command `rm -rf broadcast/*/31337` deletes it too.

The sections below are the manual stage-by-stage procedure, which is also what the script follows.

One-time setup:

```bash
cast wallet import atropyle-deployer --interactive
export DEPLOYER=0x...     # the address of the keystore just imported (or: cast wallet address --account atropyle-deployer)
export TREASURY=0x...     # the wallet that receives vault creation fees; immutable after stage 04
export SMOKE_HEIR=0x...   # a wallet other than DEPLOYER, the heir of the test Drill vault
```

Use a separate shell for mainnet. Do not reuse the shell that ran the "Rehearsal" section: a `TREASURY` or `DEPLOYER` variable left over from there (an anvil account address, whose private key is public) would become the factory's immutable treasury if you forgot to set it again.

Run the stages one by one in `contracts/`. Each script prints an `export …` line; paste that line into the terminal before running the next script.

| # | Script | Needs env | Prints |
|---|---|---|---|
| 1 | `01_CreateProcessor` | `DEPLOYER` (`ATRO_CPU` must not be set; set `REPLACE_PROCESSOR` only to abandon an old processor) | `ATRO_CPU` |
| 2 | `02_TapeOutSubs` | `DEPLOYER`, `ATRO_CPU` | `KOFN_ID`, `GE4_ID` |
| 3 | `03_TapeOutPolicy` | `DEPLOYER`, `ATRO_CPU`, `KOFN_ID`, `GE4_ID` (`POLICY_ID` must not be set) | `POLICY_ID` |
| 4 | `04_DeployAtropyle` | plus `POLICY_ID`, `TREASURY` (`ATRO_FACTORY` must not be set) | `VAULT_IMPL`, `ATRO_FACTORY` |
| 5 | `05_SmokeDrill` | `DEPLOYER`, `ATRO_FACTORY`, `SMOKE_HEIR` | `SMOKE_VAULT` |

```bash
forge script script/01_CreateProcessor.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Stages 2–5 use exactly this command, with only the file name changed.

- Run each once first without `--broadcast` (and without `--account`) to see the simulation.
- If the RPC refuses EIP-1559 transactions, add `--legacy`.
- Each script is a broadcast of its own. The chain of addresses and ids cannot be predicted: the processor's address depends on the TapeOut factory's nonce, and anyone can tape out onto your processor. So each stage reads its inputs from the environment (the values the previous stage left) and checks them again on chain; no simulation spans several stages.
- Script 01 sends nothing if the circuits beacon is not the frozen `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` (spec §2). On a `STOP: …` error, stop for good and reassess. Scripts 02 and 03 check this again, along with the processor's name, symbol and creator, before they approve or mint anything.
- Script 02 can run again: if KofN5 is already on chain, set `export KOFN_ID=…` and run again. The script tapes out only what is missing and mints only the missing transistors. On the other hand, running script 02 again when both ids exist without setting `KOFN_ID` and `GE4_ID` tapes out and pays once more (cheap: one tape-out fee and a few mints).
- Script 01 blocks a re-run in two layers. If `ATRO_CPU` is set, it stops. If the environment was lost after a successful run, it scans the 100 newest processors of the TapeOut factory (`cpuCount()` / `cpuAt(i)`) for a processor named `Atropyle` created by `DEPLOYER`, then stops and prints that address: set `export ATRO_CPU=<that address>` and go on to stage 02; do not create a second one (0.1 BEM, and the submission names the processor address). The scan reads about 100 processors over RPC, so the stage 01 simulation takes about a minute.
- Run 02 right after 01, then 03 right after 02. Spec §10 fixes `supplyCap = 10 000` (one cap shared by NAND and LATCH) and `mintPrice = 0`, so in the wait between stages anyone can mint up to the cap for just the protocol fee. Then 02 or 03 stops (sending nothing), and that processor can no longer be used.
- Only in that case (or when the old `Atropyle` processor of the same wallet is an unusable test), abandon the old processor with `REPLACE_PROCESSOR`. Script 01 creates a new processor only when the address it finds equals `REPLACE_PROCESSOR` exactly, so the command says which one you abandon; with another address, or set while no processor is found, the script stops. The price is another 0.1 BEM `createCPU` fee, the old processor is abandoned for good, and the submission must name the new address. The script prints two lines, `REPLACE_PROCESSOR: ABANDONING …` and `… creating a NEW processor …`; read them carefully in the simulation before adding `--broadcast`:

  ```bash
  unset ATRO_CPU KOFN_ID GE4_ID POLICY_ID
  export REPLACE_PROCESSOR=0x...   # exactly the address script 01 just printed in the "already exists" error
  forge script script/01_CreateProcessor.s.sol --rpc-url xlayer --sender $DEPLOYER
  ```

  Once the new stage 01 is done, `unset REPLACE_PROCESSOR`.
- Script 04 stops if `ATRO_FACTORY` is set. Do not run 04 again without need: it would deploy a second factory and overwrite `broadcast/04_DeployAtropyle.s.sol/196/run-latest.json`, the record that the SDK's deployment write step reads, so the SDK would quietly switch to the new factory. After 04 is done, back up the `broadcast/` folder before doing anything else.
- Script 04 prints `deployer` and `treasury (immutable)` before sending. On chainId 196 it refuses if `TREASURY` or `DEPLOYER` is one of the ten default anvil accounts (public private keys, a sign of environment left over from the rehearsal). The treasury cannot change after deployment, so read those two lines carefully in the simulation.
- Script 03 checks that `KOFN_ID` and `GE4_ID` match KofN5 and Ge4 byte for byte before minting; script 04 checks the policy on chain against the patched netlist and 64 vectors, and only then deploys. With a wrong id the script stops in the simulation, and no transaction is sent.
- Script 05 checks that the Drill vault points to the factory's `cpu` and `policyId`. The `poke()` in 05 is signed by `DEPLOYER`, the vault owner, so it is a check-in; it still calls `step()` on the real circuit.

### Check the treasury before stage 04

The treasury is immutable after stage 04. If a fee token (USDT0, USDC, USDG) blocks the treasury (blacklist, freeze, pause), every vault that pays its fee in that token reverts forever. Before stage 04, with the real `TREASURY` exported, run on a fork (read-only, sends nothing):

```bash
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest --match-test test_treasuryReceivesEveryFeeToken -vv
```

The test creates one paid vault per fee token on the fork and checks that the treasury balance grows by exactly `currentFee`. Three `fee paid to treasury …` lines must show and the test must PASS. If the test reverts, the treasury cannot receive that token: choose another treasury wallet, export `TREASURY` again and run again.

### Read back from the chain after each stage

The `export …` line that forge prints comes from the simulation, not from the receipt. If someone tapes out between the simulation and the send, the real id may differ from the printed one. After each stage, read it back from the chain before you `export`:

```bash
# After stage 1: the processor must be yours
cast call $ATRO_CPU "name()(string)" --rpc-url xlayer                       # "Atropyle"
cast call $(cast call $ATRO_CPU "transistors()(address)" --rpc-url xlayer) "creator()(address)" --rpc-url xlayer   # = $DEPLOYER

# After stage 2: KofN5 and Ge4
cast call $ATRO_CPU "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" $KOFN_ID --rpc-url xlayer   # 8 1 0 41
cast call $ATRO_CPU "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" $GE4_ID --rpc-url xlayer    # 8 1 0 25
cast call $ATRO_CPU "ownerOf(uint256)(address)" $KOFN_ID --rpc-url xlayer                           # = $DEPLOYER
cast call $ATRO_CPU "ownerOf(uint256)(address)" $GE4_ID --rpc-url xlayer                            # = $DEPLOYER

# After stage 3: the policy
cast call $ATRO_CPU "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" $POLICY_ID --rpc-url xlayer # 23 3 3 199
cast call $ATRO_CPU "ownerOf(uint256)(address)" $POLICY_ID --rpc-url xlayer                         # = $DEPLOYER

# After stage 4: the factory points to the right processor, policy, treasury and vault implementation
cast call $ATRO_FACTORY "cpu()(address)" --rpc-url xlayer                                           # = $ATRO_CPU
cast call $ATRO_FACTORY "policyId()(uint256)" --rpc-url xlayer                                      # = $POLICY_ID
cast call $ATRO_FACTORY "treasury()(address)" --rpc-url xlayer                                      # = $TREASURY
cast call $ATRO_FACTORY "vaultImpl()(address)" --rpc-url xlayer                                     # = $VAULT_IMPL

# After stage 5: the test Drill vault
cast call $SMOKE_VAULT "drill()(bool)" --rpc-url xlayer                                             # true
cast call $SMOKE_VAULT "state()(uint8)" --rpc-url xlayer                                            # 0 (Active)
```

If an id read back differs from the printed one (someone taped out in between), do not use the printed id. Take the real id from the receipt of the `tapeout` transaction: the `Transfer(address,address,uint256)` log emitted by Circuits has the circuit id as its 4th topic (`cast receipt <tx> --rpc-url xlayer`, or `broadcast/<script>/196/run-latest.json`). Or read the counter `cast call $ATRO_CPU "nextId()(uint256)" --rpc-url xlayer`, which is the id of the newest circuit taped out (measured on a fork: 3 after three tape-outs on a new processor); it equals your id only when nobody taped out after you. Then check `circuitInfo` and `ownerOf` as above before you `export`.

The full receipts are in `broadcast/<script>/196/run-latest.json`. The transaction hashes go into `../docs/deployments.md`.

Check the real deployment (read-only, run after stage 4). Export all of these variables, with exactly the values read back from the chain:

```bash
export DEPLOYER=0x... ATRO_CPU=0x... KOFN_ID=... GE4_ID=... POLICY_ID=...
export ATRO_FACTORY=0x... VAULT_IMPL=0x... TREASURY=0x...
XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv
```

With `ATRO_FACTORY` set, every test runs on the deployed factory itself instead of deploying a new factory on the fork, and checks `cpu()` = `ATRO_CPU`, `policyId()` = `POLICY_ID`, `treasury()` = `TREASURY`, `vaultImpl()` = `VAULT_IMPL`, and both fee levels of all three fee tokens against each token's `decimals()`. The implementation lock test runs on `VAULT_IMPL` itself. With `ATRO_FACTORY` but no `ATRO_CPU`, setUp stops. `test_tapeoutBudget` reports SKIP in this mode (it only measures when it creates its own processor on the fork).

Verify on OKLink. Keep `OKLINK_API_KEY` in `contracts/.env` (blocked by `.gitignore`). Bash does not read `.env` by itself, so load it into the shell first, or `$OKLINK_API_KEY` will be empty:

```bash
set -a; source .env; set +a
forge verify-contract $VAULT_IMPL src/AtropyleVault.sol:AtropyleVault --chain 196 --verifier oklink --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER --verifier-api-key $OKLINK_API_KEY --watch
```

```bash
forge verify-contract $ATRO_FACTORY src/AtropyleFactory.sol:AtropyleFactory --chain 196 --verifier oklink --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER --verifier-api-key $OKLINK_API_KEY --constructor-args $(cast abi-encode "constructor(address,address,uint256,address,address[])" $VAULT_IMPL $ATRO_CPU $POLICY_ID $TREASURY "[0x779Ded0c9e1022225f8E0630b35a9b54bE713736,0xB6CEceAB302E2E4948951eE7843FC24E92933061,0x4ae46a509F6b1D9056937BA4500cb143933D2dc8]") --watch
```

The deployed addresses are recorded in `../docs/deployments.md`.

## Rehearsal on an anvil fork

Run all five stages for practice before spending real money. You must set `--chain-id 31337`: an anvil fork reports chainId 196 by default, and then `forge script --broadcast` writes to `broadcast/<script>/196/`, the very folder the later stages read as the real mainnet deployment.

Terminal 1:

```bash
anvil --chain-id 31337 --fork-url https://rpc.xlayer.tech
```

Terminal 2, in `contracts/`. Open a separate shell for this section; do not share it with mainnet. Use only the unlocked anvil accounts, and never put a private key here. Some default anvil accounts already have EIP-7702 code on mainnet (at the time of writing: accounts 0, 1 and 5), so the fork has code there too and script 01 will refuse them. Check the account you pick with the same command as for a real wallet (`cast code $DEPLOYER --rpc-url $RPC` must print `0x`) instead of trusting this list; the example below uses accounts 2, 3 and 4:

```bash
export RPC=http://127.0.0.1:8545
test "$(cast chain-id --rpc-url $RPC)" = "31337" || echo "NOT A LOCAL ANVIL"
export DEPLOYER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   # anvil account 2
export TREASURY=0x90F79bf6EB2c4f870365E785982E1f101E93b906   # account 3
export SMOKE_HEIR=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 # account 4
cast code $DEPLOYER --rpc-url $RPC                           # must print 0x

# Give the deployer BEM on the fork: borrow an address that holds at least 1 BEM (look up BEM holders on OKLink)
export BEM_HOLDER=0x...
cast rpc anvil_impersonateAccount $BEM_HOLDER --rpc-url $RPC
cast rpc anvil_setBalance $BEM_HOLDER 0x56BC75E2D63100000 --rpc-url $RPC
cast send 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952 "transfer(address,uint256)" $DEPLOYER 200000000 --from $BEM_HOLDER --unlocked --rpc-url $RPC

forge script script/01_CreateProcessor.s.sol --rpc-url $RPC --unlocked --sender $DEPLOYER --broadcast --slow
```

Paste the `export ATRO_CPU=…` line, then run 02, 03, 04 and 05 with the same command, changing only the file name. `--unlocked` is only for a local anvil; on mainnet, always use `--account`. When the rehearsal is done, stop anvil, delete the rehearsal's records (`broadcast/*/31337`) so the later stages do not read them by mistake, then unset every variable of the rehearsal (or close this shell). Delete only the `31337` folders: `broadcast/*/196/` is the record of the mainnet deployment, `.gitignore` blocks it so there is no other copy, and the SDK's deployment write step reads from it.

```bash
unset DEPLOYER TREASURY SMOKE_HEIR ATRO_CPU KOFN_ID GE4_ID POLICY_ID VAULT_IMPL ATRO_FACTORY SMOKE_VAULT BEM_HOLDER RPC REPLACE_PROCESSOR
rm -rf broadcast/*/31337
```

## Known limits

These decisions were settled in review. They are not bugs, but users and integrators need to know them:

- Every external call in `distribute()` has a gas cap: views 100,000, ERC-20 `transferFrom` 300,000, ERC-721/1155 `safeTransferFrom` 500,000. A view call that goes over its cap reads as 0, and that asset is skipped silently (no event); a transfer call that goes over its cap always fails with a `TransferFailed` event. In both cases the sweep goes on. A transaction without enough gas to hand the full cap to the next call reverts with `InsufficientGas()`, so a caller cannot squeeze the gas to break just one heir's transfer.
- The part of an ERC-20 whose transfer failed (for example a blacklisted heir) stays in the owner's wallet and is split again by bps among all heirs in later sweeps. That heir's NFTs and ERC-1155 tokens stay put too, and do not go to anyone else.
- An heir or recovery target whose address has code set under EIP-7702 counts as having code: ERC-721 and ERC-1155 `safeTransferFrom` calls its receiver hook. If the delegated code lacks that hook, the transfer fails with `TransferFailed`, the asset stays in the owner's wallet and is tried again in later sweeps. ERC-20 is not affected.
- While the vault is not Released, every transaction the owner signs is proof of life, `poke()` and `distribute()` included (spec §3.2 bit 21, §4.5 I4): these two functions act like `checkIn()`, cancel the alarm, clear the votes and never release. So an owner cannot trigger the alarm on their own vault, a Drill included; for a demo with one wallet, call `poke()` from another address or let the keeper call it. Once Released, a `distribute()` signed by the owner sweeps the assets like anyone else's.
- An heir, guardian or recovery target is never the vault's own address: `setHeirs` and `setGuardians` revert with `InvalidHeirs` / `InvalidGuardians`, and `voteRecovery` reverts with `InvalidTarget`. The vault has no withdraw function, so assets sent to it would be stuck forever, and the vault can never sign, so a guardian seat held by the vault would be a dead seat.
- The worst case, 20 ERC-20 assets that are all hostile × 5 heirs, costs about 28 million gas. If X Layer later sets a per-transaction gas cap far below that (for example 2^24 under EIP-7825), a vault with about 9 or more hostile assets could not be swept in one transaction.
