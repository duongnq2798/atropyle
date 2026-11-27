# Atropyle: addresses on X Layer mainnet (chainId 196)

The project's deployer wallet created every address below with `npm run deploy:mainnet` on 22 November 2026: 17 transactions, blocks 76566929 to 76567053, for 0.14 BEM and 0.00407 OKB. Machine-readable copy: [`deployments/xlayer.json`](../deployments/xlayer.json), written by `npm run deployment:write` (read-only chain reads, through two independent RPC operators).

Check it again with one read-only command (`npx -y atropyle@0.1.0 verify`, or from a checkout: `node packages/cli/dist/bin.js verify`). Result when this file was written, at block 76567369: P1-P8 hold on all 67,108,864 combinations, the netlists of all three circuits match the source in `circuits/`, the beacon is frozen, and the two RPC operators agree. Check with Foundry: `XLAYER_FORK_RPC=https://rpc.xlayer.tech forge test --match-contract ForkTest -vv` with the environment variables of `contracts/broadcast/atropyle-deploy/196/exports.env` (10 PASS, 1 SKIP, which is `test_tapeoutBudget`, as designed).

| Component | Value | Transaction |
|---|---|---|
| Deployer | [`0xC0a61674Fa1caAd04500073ea94Ec9006D7A2375`](https://www.oklink.com/xlayer/address/0xC0a61674Fa1caAd04500073ea94Ec9006D7A2375) | |
| Processor `ATRO` (Circuits) | [`0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05`](https://www.oklink.com/xlayer/address/0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05) | [`createCPU`](https://www.oklink.com/xlayer/tx/0xc7b23c69e2489d22656035afc127eb0e5baab5fe67657a02d8245977d9dd3978) |
| Transistors of `ATRO` | [`0x9d3Cf72bf9d080689bf97d54FF00758A7597caAc`](https://www.oklink.com/xlayer/address/0x9d3Cf72bf9d080689bf97d54FF00758A7597caAc) | |
| Circuits beacon (frozen) | `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` | |
| Circuit `KofN5` | id 1 (8 in, 1 out, 41 gates) | [`tapeout`](https://www.oklink.com/xlayer/tx/0xd0d34990ea061bd1d0a5296bb2a9ea6db8e6dcd0314ab3db57005926719d97c2) |
| Circuit `Ge4` | id 2 (8 in, 1 out, 25 gates) | [`tapeout`](https://www.oklink.com/xlayer/tx/0x59ef44370f1c29a6e548285bf15714fe987d1654636b32724acd79f617fd187a) |
| Circuit `AtropylePolicy v1` | id 3 (23 in, 3 out, 3 state bits, 199 gates) | [`tapeout`](https://www.oklink.com/xlayer/tx/0xff066290337ec07a39159ce060e69cbe0cb681d82f775cf39c8d530a6caa1afd) |
| `AtropyleVault` (implementation) | [`0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881`](https://www.oklink.com/xlayer/address/0x96Ea6249e14F5F62ab87A5D76800B1C564c4d881) | [create](https://www.oklink.com/xlayer/tx/0xb6f292f79f6e79591e64c990fe8d9448c378f7d6fcea7a70e2df8d24449666b0) |
| `AtropyleFactory` | [`0x7eCbBECA8F90A868A12aF48B766264bf9c87a651`](https://www.oklink.com/xlayer/address/0x7eCbBECA8F90A868A12aF48B766264bf9c87a651) | [create](https://www.oklink.com/xlayer/tx/0xb4e4c9723a64903677d6292b11ee47d4d11298bc085f88c4fc7e7f1e3674b372) |
| Treasury | [`0x990221559B7EB3516204dc73535d6581391cFAa4`](https://www.oklink.com/xlayer/address/0x990221559B7EB3516204dc73535d6581391cFAa4) | |
| Test Drill vault | [`0x481F28748959036B48bc6779797228D74f15f4b9`](https://www.oklink.com/xlayer/address/0x481F28748959036B48bc6779797228D74f15f4b9) | [`createVault`](https://www.oklink.com/xlayer/tx/0x237c4446b30a8ff889cd7eabd982452676baa4b6d2b72c6a67c88277e673b717), [`poke`](https://www.oklink.com/xlayer/tx/0x7702346baa6d84172b6b6900037e31f2db95d079760c410c95fa7c8764542e7d) |

The factory's vault creation fee: 1.99 (for the first 100 paid vaults), then 9.90 USDT0, USDC or USDG, sent straight to the treasury. A Drill vault is free.

`step` gas measured on the deployed contracts (ForkTest, mainnet fork): 624406. A full Drill lifecycle (create, approve, poke, two attestDeath calls, distribute): 3736276 gas.

The source is not verified on OKLink yet: that step needs the maintainer's `OKLINK_API_KEY` (commands in `contracts/README.md`). There is no builder code yet: `builderCode` in `deployments/xlayer.json` stays `null` until the maintainer has a code and runs `npm run deployment:write -- --builder-code <code>` again.

The other transactions of the five stages (BEM approvals, transistor mints) are in `contracts/broadcast/atropyle-deploy/196/` on the deploy machine (git ignores this folder).

## DeWEB site

The web app goes on DeWEB, in the container of a circuit anchored on the `ATRO` processor itself. Machine-readable copy: [`deployments/deweb.json`](../deployments/deweb.json), written by `npm run deweb:site` (read-only chain reads). Nothing has been taped out or published on mainnet yet: every "—" cell below waits for steps 3 to 6.

| Component | Value | Transaction |
|---|---|---|
| Anchor circuit `0x00000002000002` (NAND, 1 gate) | id — | — |
| Container (opened through the opener `0x536adD8F30f03b69f6fbF29d425A816A0dC50106`) | — | — |
| Canonical name (bound for 120 months, `value = 0`) | — | — |
| Gateway URL (checks itself in the browser) | — | |
| Gateway URL, compatibility mode (`-open`, the gateway checks on your behalf) | — | |
| SiteRegistry | `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` | |
| DomainBinding | `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9` | |

There is no operator wallet and no key in the repository. The only signer is the deployer wallet (which holds the anchor circuit NFT), through the Foundry keystore `--account atropyle-deployer` on mainnet. Files are published through `npm run deweb:publish -- --emit`, then `forge script script/07_DewebPublish.s.sol`: `--emit` only reads the chain and writes a calls file, and forge signs with the user's keystore. The rehearsal (step 2) sends transactions only to an anvil fork on `127.0.0.1`, never to the real network.

Every `forge`, `cast` and `curl` command below runs in Git Bash. The `npm run` commands run at the repository root, and the `forge script` commands run in `contracts/`.

### Runbook

Steps marked [USER] run in the maintainer's own terminal, with the deployer keystore. Steps marked [CLAUDE] only read the chain or send to a local anvil fork, so an agent can run them.

Precondition: Plan 1 is deployed on mainnet, and the two public addresses `DEPLOYER` and `ATRO_CPU` are in the table at the top of this file.

Each code block is its own shell session; run the whole block. Shell variables do not carry over to the next block, so every block `export`s the variables it needs (`<...>` is a value you fill in).

#### 1. [CLAUDE] Pre-check, read-only on mainnet (after the mainnet deployment)

```bash
export RPC=https://rpc.xlayer.tech
export DEPLOYER=<deployer address> ATRO_CPU=<ATRO address>
cast call 0x536adD8F30f03b69f6fbF29d425A816A0dC50106 "FEE()(uint256)" --rpc-url $RPC
cast call $ATRO_CPU "TAPEOUT_FEE()(uint256)" --rpc-url $RPC
cast call 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "monthlyFee()(uint256)" --rpc-url $RPC
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 "CHUNK_MAX()(uint256)" --rpc-url $RPC
cast balance $DEPLOYER --rpc-url $RPC --ether
cast call 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952 "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC
```

Expected:

- `FEE()` = `80000000000000000` (0.08 OKB); `TAPEOUT_FEE()` = `1300000000000000` (0.0013 OKB); `monthlyFee()` = `0`; `CHUNK_MAX()` = `24000`.
- The deployer's OKB covers: the tape-out fee, the 0.08 OKB opener fee, gas, and the OKB for publishing the site that the dry run (step 4) prints. The last amount is known only after step 4; if it falls short, top up before step 5.
- Enough BEM to mint one NAND (or the deployer still has a spare NAND from Plan 1).

If a value differs, stop and tell the coordinator before going on.

#### 2. [CLAUDE] Rehearsal on an anvil fork (after the deployment, before the user's step 3)

This step sends transactions only to an anvil fork on `127.0.0.1` (chain 196, with the `DEPLOYER` account impersonated). It sends nothing to the real network and needs no key. Pick a free loopback port other than 8545 (for example 8546). The exports and `forge` run in the same block.

The rehearsal uses `--emit` plus forge/cast `--unlocked`, because `npm run deweb:publish -- --unlocked` refuses every chain other than 31337, the chain-196 fork included.

Run anvil in a terminal of its own and leave it open (stop it with Ctrl+C in that same terminal, see the cleanup):

```bash
anvil --fork-url https://rpc.xlayer.tech --port 8546
```

The next block runs in another terminal:

```bash
export FORK=http://127.0.0.1:8546
export DEPLOYER=<deployer address> ATRO_CPU=<ATRO address>
cast rpc anvil_impersonateAccount $DEPLOYER --rpc-url $FORK
cd contracts
# pass 1: tape out the anchor circuit
forge script script/06_DewebSite.s.sol --rpc-url $FORK --unlocked --sender $DEPLOYER --broadcast --slow
# set DEWEB_TOKEN_ID to the id that pass 1 prints, then pass 2: open the container
export DEWEB_TOKEN_ID=<n>
forge script script/06_DewebSite.s.sol --rpc-url $FORK --unlocked --sender $DEPLOYER --broadcast --slow
cd ..
```

Pass 2 prints `export DEWEB_CONTAINER=<address>`; that value is used only by the bind step below (the later blocks export it again themselves).

Write the fork's site identity to a temporary file (leaving `deployments/` alone), build, and plan:

```bash
export FORK=http://127.0.0.1:8546
export ATRO_CPU=<ATRO address> DEWEB_TOKEN_ID=<n>
npm run deweb:site -- --cpu $ATRO_CPU --token-id $DEWEB_TOKEN_ID --rpc $FORK --out site-dist/deweb-fork.json
npm run site:build -- --target deweb --no-docs
npm run deweb:publish -- --emit contracts/deweb-calls/fork.json --rpc $FORK --site site-dist/deweb-fork.json
```

`--emit` prints the keccak256 of the file and two commands (the `show()` check and the broadcast). Run them on the fork: in the broadcast command, replace `--account atropyle-deployer` with `--unlocked --sender $DEPLOYER`, and use `--rpc-url $FORK` for both commands.

```bash
export FORK=http://127.0.0.1:8546
export DEPLOYER=<deployer address>
cd contracts
DEWEB_CALLS=deweb-calls/fork.json forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url $FORK
DEWEB_CALLS=deweb-calls/fork.json DEWEB_KECCAK=0x<hash> forge script script/07_DewebPublish.s.sol --rpc-url $FORK --unlocked --sender $DEPLOYER --broadcast --slow
cd ..
```

If `--emit` splits the site into several parts (each file holds at most 1 MB of data): after each broadcast, delete that part's file, run `--emit` again for the next part, and repeat until the dry run reports nothing left. Then bind and check:

```bash
export FORK=http://127.0.0.1:8546
export DEPLOYER=<deployer address> DEWEB_CONTAINER=<the fork's container address>
export DEWEB_NAME=$(node -p "require('./site-dist/deweb-fork.json').name")
cast send 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "bind(string,address,uint256)" "$DEWEB_NAME" $DEWEB_CONTAINER 120 --value 0 --from $DEPLOYER --unlocked --rpc-url $FORK
cast call 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "isLive(string,address)(bool)" "$DEWEB_NAME" $DEWEB_CONTAINER --rpc-url $FORK
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 "fallbackPath(address)(string)" $DEWEB_CONTAINER --rpc-url $FORK
npm run deweb:publish -- --dry-run --rpc $FORK --site site-dist/deweb-fork.json
```

Expected: `deweb:site` writes `name` = `<n>.2.<cpuIndex>.tape`; `bind` has `status 1 (success)`; `isLive` = `true`; `fallbackPath` = `"404.html"`; the dry run prints `Nothing to publish: the chain already has this site.`

Cleanup: press Ctrl+C in the terminal that runs anvil (only the anvil of this step), then delete the leftovers in the other terminal. If you started anvil in the background with `anvil ... & ANVIL_PID=$!`, stop it with `kill "$ANVIL_PID"` in that same shell session.

```bash
rm -rf contracts/broadcast/06_DewebSite.s.sol/196 contracts/broadcast/07_DewebPublish.s.sol/196
rm -f contracts/deweb-calls/fork*.json site-dist/deweb-fork.json
```

The fork's two `broadcast/.../196/` folders must be deleted: they are the fork's records, not mainnet's. Left in place, the fork's `run-latest.json` could be mistaken for the mainnet one when the transaction hashes are taken in step 3. If the rehearsal shows a bug, fix the script before the user runs step 3.

#### 3. [USER] Tape out and open the container on mainnet

In the user's terminal, with the same keystore as Plan 1. The script runs in two passes; the user types the keystore password at the `forge` prompt.

```bash
export DEPLOYER=<deployer address> ATRO_CPU=<ATRO address>
cd contracts
# pass 1: tape out the anchor circuit (run it only ONCE)
forge script script/06_DewebSite.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Pass 1 prints `export DEWEB_TOKEN_ID=<n>`. That id comes from the simulation, so check it on chain before going on: `cast call $ATRO_CPU 'ownerOf(uint256)(address)' <n> --rpc-url https://rpc.xlayer.tech` must return the deployer address.

**Do not run pass 1 again.** The script cannot detect an anchor circuit that already exists: a second run tapes out one more anchor circuit (0.0013 OKB). If the printed id (from the simulation) turns out wrong, or pass 1 ran twice by mistake, take the real id from the `Transfer` log of `cast receipt <tape-out hash> --rpc-url https://rpc.xlayer.tech`, or from `contracts/broadcast/06_DewebSite.s.sol/196/run-latest.json`, and confirm it with `cast call $ATRO_CPU 'ownerOf(uint256)(address)' <id> --rpc-url https://rpc.xlayer.tech`. Then:

```bash
export DEPLOYER=<deployer address> ATRO_CPU=<ATRO address>
cd contracts
export DEWEB_TOKEN_ID=<n>
# pass 2: open the container (0.08 OKB)
forge script script/06_DewebSite.s.sol --rpc-url xlayer --account atropyle-deployer --sender $DEPLOYER --broadcast --slow
```

Pass 2 refuses to run if the circuit does not belong to `DEPLOYER` or its netlist is not the anchor circuit, and skips `open` if the container already exists. Pass 2 prints `export DEWEB_CONTAINER=<address>`.

After each pass, the user sends Claude the public values it printed (`DEWEB_TOKEN_ID`, `DEWEB_CONTAINER`) and the hash of each transaction (from the `forge` output, or from `contracts/broadcast/06_DewebSite.s.sol/196/run-latest.json`).

#### 4. [CLAUDE] Record the site identity, plan the publish

With `DEWEB_TOKEN_ID` and `DEWEB_CONTAINER` from step 3:

```bash
export RPC=https://rpc.xlayer.tech
export ATRO_CPU=$(node -p "require('./deployments/xlayer.json').cpu")
export DEWEB_TOKEN_ID=<n sent by the user>
cast receipt <tape-out hash> --rpc-url $RPC      # check every hash the user sent: status 1 (success)
cast receipt <open hash> --rpc-url $RPC
npm run deweb:site -- --cpu $ATRO_CPU --token-id $DEWEB_TOKEN_ID
node -e "JSON.parse(require('fs').readFileSync('deployments/deweb.json','utf8'))"
export DEWEB_NAME=$(node -p "require('./deployments/deweb.json').name")
BC=$(node -p "require('./deployments/xlayer.json').builderCode ?? ''")
FACTORY=$(node -p "require('./deployments/xlayer.json').factory")
FACTORY_BLOCK=$(node -p "require('./deployments/xlayer.json').factoryBlock")
npm run deployment:write -- ${BC:+--builder-code "$BC"} --factory "$FACTORY" --factory-block "$FACTORY_BLOCK"
npm run build
npm run site:build -- --target deweb
npm run deweb:publish -- --dry-run
```

Expected:

- `deployments/deweb.json` parses; `chainId` 196, `container` = the container the user sent in step 3, `name` = `<DEWEB_TOKEN_ID>.2.<cpuIndex>.tape`, `gatewayUrl` = `https://<DEWEB_TOKEN_ID>-2-<cpuIndex>.tapekit.org/`. Check it with `node`, not with Biome: `deployments/` is outside Biome's scope.
- `deployments/xlayer.json` keeps `webUrl` = `https://atropyle.xyz/` (Vercel is the main site, spec §10; DeWEB is the 100% on-chain copy; `deployment:write` writes that value when `--web-url` is not given); `builderCode` keeps its old value (if any); `factory` and `factoryBlock` do not change. `--factory` and `--factory-block` come from that same file, because the Plan 1 broadcast file may no longer be on the machine.
- `site:build` prints `… ready for deweb (web only)` while there is no `apps/docs`. If the docs exist but are not clean, the command stops; run it again with `--no-docs` (the docs wait for Plan 6).
- The dry run prints every file as `new`, a total fee line and a recommended top-up line (estimate ×3). Claude sends this OKB amount to the user; the deployer must still hold that amount before step 5.

Fill in the cells of the table above from `deployments/deweb.json` (id, container, name, the two URLs; the `-open` URL is `https://<DEWEB_TOKEN_ID>-2-<cpuIndex>-open.tapekit.org/`) and the tape-out and `open` transaction hashes. The name's transaction cell is filled in at step 6. Then:

```bash
git add deployments/deweb.json deployments/xlayer.json packages/sdk/src/deployments/xlayer.ts docs/deployments.md
git commit -m "feat(web): record the DeWEB site identity"
```

#### 5. [USER, with CLAUDE] Publish the site

[CLAUDE] writes the calls file (read-only chain reads, sends nothing):

```bash
npm run deweb:publish -- --emit contracts/deweb-calls/site.json
```

`--emit` writes the file, prints its keccak256, then prints two commands to run in `contracts/`. Each file holds at most 1 MB of data, so a large site gives several parts.

[USER], in their own terminal, before typing any password:

1. Run the `show()` check that `--emit` printed. It needs no key, sends nothing, and prints the keccak256 plus one line per call (target, function name, path):
   ```bash
   cd contracts
   DEWEB_CALLS=deweb-calls/site.json forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url 'https://rpc.xlayer.tech'
   ```
2. Compare that keccak256 with the keccak256 that `--emit` printed. If they differ, stop.
3. Still in `contracts/`, run the broadcast command (with `DEWEB_KECCAK`). If the file differs from the one checked, forge stops with `HashMismatch` or `NoExpectedHash` and sends nothing:
   ```bash
   DEWEB_CALLS=deweb-calls/site.json DEWEB_KECCAK=0x<hash> forge script script/07_DewebPublish.s.sol --rpc-url 'https://rpc.xlayer.tech' --account atropyle-deployer --broadcast --slow
   ```
4. Delete the file of the part just sent: `rm contracts/deweb-calls/site.json` (from the repository root) or `rm deweb-calls/site.json` (in `contracts/`).

[CLAUDE] runs `npm run deweb:publish -- --dry-run` at the repository root. Expected: `Nothing to publish: the chain already has this site.`, or a plan for the next part. If parts remain, run `--emit` again, then repeat the check and the broadcast for that part. When nothing is left to publish, `--emit` deletes the used files of the same container itself.

If interrupted halfway (network, out of gas): run `--emit` again. Complete files are skipped and partial ones are resumed. Do not broadcast an old part file again: it would cut a file back to its first chunks.

#### 6. [USER] Bind the canonical name

```bash
export DEWEB_NAME=$(node -p "require('./deployments/deweb.json').name")
export DEWEB_CONTAINER=$(node -p "require('./deployments/deweb.json').container")
cast send 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "bind(string,address,uint256)" "$DEWEB_NAME" $DEWEB_CONTAINER 120 --value 0 --rpc-url https://rpc.xlayer.tech --account atropyle-deployer
```

Expected: `status 1 (success)`. Send the hash to Claude for the table.

#### 7. [CLAUDE] Check the chain and the gateway (read-only)

```bash
export RPC=https://rpc.xlayer.tech
export DEWEB_NAME=$(node -p "require('./deployments/deweb.json').name")
export DEWEB_CONTAINER=$(node -p "require('./deployments/deweb.json').container")
cast receipt <bind hash> --rpc-url $RPC
cast call 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9 "isLive(string,address)(bool)" "$DEWEB_NAME" $DEWEB_CONTAINER --rpc-url $RPC
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 "fallbackPath(address)(string)" $DEWEB_CONTAINER --rpc-url $RPC
npm run deweb:publish -- --dry-run
curl -s -D - -o /dev/null "$(node -p "require('./deployments/deweb.json').gatewayUrl.replace('.tapekit.org', '-open.tapekit.org')")"
```

Expected:

- `isLive` = `true`; `fallbackPath` = `"404.html"`.
- The dry run prints `Nothing to publish: the chain already has this site.`
- `curl` prints a `200` status line with the headers `x-tape-status: ok`, `x-tape-name: <DEWEB_NAME>`, `x-tape-container: <DEWEB_CONTAINER>`.

Only when all three hold, fill in the `bind` hash in the table and replace the remaining "—" cells; if one item is wrong, keep "—" and tell the user. Then commit `docs/deployments.md`.

#### 8. [USER] Check in a real browser

Open `gatewayUrl` in Chrome with OKX Wallet, then:

1. The home page shows, with the "Beta — unaudited" banner. Open `/proof/`, press "Run the proof", and wait for the verdict.
2. Press "Connect wallet": OKX Wallet shows in the list (the extension can inject under the site's CSP). If no wallet shows, note the CSP error message in the DevTools Console.
3. Open `/.tape/status` on the same host: it has the "100% on-chain" badge, and the external and off-chain lists are both empty.
4. Open `/vault/#<vault address>` (a real vault address, for example the test Drill vault in the table at the top of this file): the page reads data from the chain.
5. In the DevTools Console, run `await window.okxwallet.request({ method: 'wallet_getCapabilities', params: [(await window.okxwallet.request({ method: 'eth_requestAccounts' }))[0], ['0xc4']] })` and send the result to Claude (an open question about EIP-5792 on chain 196).
6. Open the `-open` URL in the OKX App browser on a phone: the page shows and the App's wallet connects.
7. Open `/prof/` on the same host: the 404 page shows (fallback `404.html`) and suggests `/proof/`.

Report the result of each item to Claude. If item 2, 3 or 4 fails, Claude opens an issue and fixes it before the DeWEB link goes into the README or the submission.

#### 9. Publish again once the docs exist (after Plan 6)

Once `apps/docs` exists: [CLAUDE] runs `npm run site:build -- --target deweb`. If it reports the docs are not clean, record the list of errors for Plan 6 and keep the web-only build. If they are clean, redo step 5 (`--emit`, the `show()` check, the broadcast with the user's keystore) and step 7. There is no operator and no key to set up.

## Vercel (production)

[USER] The root `vercel.json` builds the site; nothing else is configured in code. In the Vercel project (repository root as the root directory):

1. Environment variable `NEXT_PUBLIC_API_URL` (Production) = the Functions URL of the backend, `https://<project-ref>.supabase.co/functions/v1`. Without it the hosted features (email alerts, `/join/` sign-up) show their hosted-only state. It never goes into `vercel.json`.
2. Domains: `atropyle.xyz`, with `www.atropyle.xyz` redirecting to it (308). `vercel.json` repeats the redirect.
3. Web Analytics and Speed Insights stay off.
4. A preview deployment of the cutover branch passes these checks before it is promoted: `/`, `/proof/`, `/verify/`, `/join/`, `/#/proof` (redirects to `/proof/`), `/proof` (308 to `/proof/`), `/docs/reference/errors.html#not_owner`, `/docs/schemas/error.json`, `/no-such-page/` (404 page), and the response headers of `/` include the `Content-Security-Policy` of `vercel.json`.

Agents never change the Vercel project settings or the Supabase secrets.
