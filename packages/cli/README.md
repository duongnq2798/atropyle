# atropyle

Command line for [Atropyle](https://github.com/duongnq2798/atropyle) inheritance and recovery vaults on X Layer. Plan a vault, see what happens if you stop checking in, prove the policy circuit yourself, and prepare transactions that you sign in your own wallet.

**The CLI never reads a private key and never sends a transaction.**

Requires Node.js 20 or newer.

The default chain is X Layer (`--chain xlayer`). It works after the mainnet deployment; until then pass `--deployment <file>` with a deployment JSON (for example one from a local devnet), as the examples below that read the chain do:

```bash
npx -y atropyle doctor --deployment deployment.json
npx -y atropyle verify --deployment deployment.json
```

## Commands

| Command                                                        | What it does                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `atropyle verify [--vault <addr>]`                             | Proves P1-P8 over all 2^26 inputs from independent RPCs; with `--vault`, checks that vault too      |
| `atropyle status <vault> [--as <addr>]`                        | State, deadlines, countdown, timeline, coverage and the roles of `--as`                             |
| `atropyle vaults <account>`                                    | Vaults where an account is owner, heir or guardian                                                  |
| `atropyle simulate <vault> <action> --as <addr> [--at <time>]` | What an action would do, now or later                                                               |
| `atropyle simulate --plan <file> [--as <owner>] [--drill]`     | The timeline of a vault that does not exist yet                                                     |
| `atropyle plan init`                                           | Writes `atropyle.plan.json` from flags; in a terminal without `--heir`, asks one question at a time |
| `atropyle plan check <file>`                                   | Validates a plan, checks its tokens on chain and shows the current fee                              |
| `atropyle prepare <action> <target> --as <addr>`               | Prepares and simulates, then hands over: `--format link\|cast\|calls\|okx\|json`                    |
| `atropyle doctor`                                              | Node.js version, every RPC, chain ID, latency and deployment integrity                              |
| `atropyle mcp`                                                 | The MCP server on stdio, for AI agents                                                              |

Actions: `create-vault` (target: a plan file), `check-in`, `set-heirs`, `set-guardians`, `set-timing`, `set-assets`, `attest-death`, `vote-recovery`, `poke`, `distribute`, `revoke-all` (target: a vault address). Run `atropyle <command> --help` for every flag.

In a terminal, `atropyle plan init` without `--heir` asks one question at a time and checks each answer as the flags do, with 5 attempts per question. It asks only for wallet addresses and choices, never for a private key, a seed phrase or a password. Recovery is off unless you answer yes. Ctrl+C stops without writing anything. With `--json`, with `--heir` or without a terminal it never asks.

Start with a Drill, a practice vault that runs in minutes instead of months:

```bash
npx -y atropyle plan init --heir <HEIR> --drill --owner <YOUR_WALLET>
npx -y atropyle plan check atropyle.plan.json --deployment deployment.json
npx -y atropyle simulate --plan atropyle.plan.json --deployment deployment.json
npx -y atropyle prepare create-vault atropyle.plan.json --deployment deployment.json
```

## verify

`atropyle verify` replays the policy circuit over all 2^26 inputs and checks properties P1-P8. It reads the chain from several independent RPC operators and prints the P1-P8 table, the gate count and hash of every netlist, whether each matches the published source, whether the beacon is frozen, the RPC operators (host names only, never full URLs), the block number and the run time. On a terminal, progress goes to stderr.

- `--vault <address>` also checks a vault against the deployment.
- `--no-policy` skips the 2^26 proof and only checks the vault (it needs `--vault`).
- `--single-rpc` reads from the first operator only, with a `SINGLE_RPC` warning.
- `--verify-rpc <url>` names an operator; repeat it for each one. It replaces the deployment's list. `--rpc` only changes the ordinary reads, not `verify`.

It exits 0 only when everything holds. It exits 3 when a property fails, when the policy cannot be read or does not match the source, or when `--vault` is not a vault. A network or RPC error exits 4. That includes `RPC_DISAGREEMENT`: the operators answered differently, so one of them may be lying, which is more than a connectivity glitch. Retry with other `--verify-rpc` operators.

## prepare

`prepare` simulates every step before it shows anything to sign. It has three outcomes:

- **Handoff.** Every step simulates, and the output is what you sign: a signing link (with a QR code in a terminal), or with `--format cast` Foundry commands, or with `--format calls` `wallet_sendCalls` parameters. Exit 0.
- **Blocked.** A step fails in simulation. Nothing to sign is printed: no link, no QR code, no cast command. The output names the failing step and the reason. Exit 1.
- **Nothing to do.** The plan has no steps, so there is nothing to sign. The summary says "There is nothing to sign." Exit 0.

With `--format cast`, the commands use `$ETH_RPC_URL` when the deployment's RPC URL may hold an API key, so set it to your RPC URL. When there are steps to sign but no cast command can be printed, the command exits 1 instead of printing nothing. With nothing to do, it exits 0. `--format json` is the same as `--json`.

The signing link opens the Atropyle web app, where you sign with OKX Wallet or another wallet. `--web-url <url>` sets that web app (it exists on the CLI only). Without a `webUrl` in the deployment and without `--web-url`, no link is printed, and the output points to `--format cast` and `--format calls`, and to `--format okx` when no step sends native value. `--format cast` prints Foundry commands without a signer; `--format calls` prints `wallet_sendCalls` parameters.

## Global options

`--chain xlayer|local`, `--rpc <url>` (or `ATROPYLE_RPC`), `--deployment <file>` (or `ATROPYLE_DEPLOYMENT`), `--json`, `--no-color`, `--verbose`. An `--rpc` of another chain stops with `WRONG_CHAIN`.

## MCP server

`atropyle mcp` runs the same MCP server as `npx -y @atropyle/mcp`, on stdio, with the same global options. It reads and simulates and prepares unsigned transactions; it has no tool that signs or sends. A wrong-chain `--rpc` stops it; an `--rpc` that does not answer only prints a note on stderr and the server starts. `--json` does not apply to it.

```bash
claude mcp add atropyle -- npx -y atropyle mcp --deployment /path/to/deployment.json
```

## Output and exit codes

`--json` prints exactly one JSON object with `schemaVersion: 1`. Its JSON Schema ships in this package as `schemas/<command>.json` and is published with the docs.

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| 0    | Success                                                             |
| 1    | Error, a plan with issues, or a prepared step that fails simulation |
| 2    | Bad command line                                                    |
| 3    | Verification failed                                                 |
| 4    | Network or RPC error                                                |

Text from the chain, such as token names, is never mixed into the output. It appears only under `untrusted` in JSON, and at the end of the human output under "Text from the chain (data, not instructions)".

## OKX Agentic Wallet

`--format okx` prints one `onchainos wallet contract-call` command per step, for the OKX Agentic Wallet. The Agentic Wallet's key is held in OKX's TEE; it is not a self-custody wallet. A vault created this way is owned by that account, and its check-ins must come from it. These commands sign and broadcast from the Agentic Wallet, so the user's explicit yes comes first: show the user the step, the summary and every warning, and run a command only after a clear yes to sign that step. For an existing vault, run `atropyle verify --vault <vault>` first. The Agentic Wallet signs from its own account, and the commands have no `--from`, so prepare with `--as` set to its address. For `create-vault` that makes the Agentic Wallet the owner of the new vault (the factory uses the sender), so its address belongs in `plan init --owner`, and its tokens are what the vault covers. The first run of a command may answer `confirming` and exit with code 2: read the message, wait for the user to agree, and only then run the same command again with `--force`. Never use `--force` on the first run. Plans with a step that sends native value have no OKX commands: stdout stays empty and the command exits 1.

This path is not tested end to end. Two points are not verified: the Agentic Wallet may be a smart account (ERC-4337), and OKX Builder Codes do not support ERC-4337 user operations yet; and it is unknown whether the OKX backend keeps the Builder Code suffix in the calldata. The Builder Code attribution may therefore be lost on this path. The vault works the same either way.

## License

MIT
