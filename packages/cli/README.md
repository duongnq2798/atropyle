# atropyle

Command line for [Atropyle](https://github.com/duongnq2798/atropyle) inheritance and recovery vaults on X Layer. Plan a vault, see what happens if you stop checking in, prove the policy circuit yourself, and prepare transactions that you sign in your own wallet.

**The CLI never reads a private key and never sends a transaction.**

Requires Node.js 20 or newer.

The default chain is X Layer (`--chain xlayer`). It works after the mainnet deployment; until then pass `--deployment <file>` with a deployment JSON (for example one from a local devnet), as every example below does:

```bash
npx -y atropyle doctor --deployment deployment.json
npx -y atropyle verify --deployment deployment.json
```

## Commands

| Command                                                        | What it does                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `atropyle verify [--vault <addr>]`                             | Proves P1-P8 over all 2^26 inputs from independent RPCs; with `--vault`, checks that vault too |
| `atropyle status <vault> [--as <addr>]`                        | State, deadlines, countdown, timeline, coverage and the roles of `--as`                        |
| `atropyle vaults <account>`                                    | Vaults where an account is owner, heir or guardian                                             |
| `atropyle simulate <vault> <action> --as <addr> [--at <time>]` | What an action would do, now or later                                                          |
| `atropyle simulate --plan <file> [--as <owner>] [--drill]`     | The timeline of a vault that does not exist yet                                                |
| `atropyle plan init`                                           | Writes `atropyle.plan.json`                                                                    |
| `atropyle plan check <file>`                                   | Validates a plan, checks its tokens on chain and shows the current fee                         |
| `atropyle prepare <action> <target> --as <addr>`               | Prepares and simulates, then hands over: `--format link\|cast\|calls\|json`                    |
| `atropyle doctor`                                              | Node.js version, every RPC, chain ID, latency and deployment integrity                         |
| `atropyle mcp`                                                 | The MCP server on stdio, for AI agents                                                         |

Actions: `create-vault` (target: a plan file), `check-in`, `set-heirs`, `set-guardians`, `set-timing`, `set-assets`, `attest-death`, `vote-recovery`, `poke`, `distribute`, `revoke-all` (target: a vault address). Run `atropyle <command> --help` for every flag.

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

It exits 0 only when everything holds. It exits 3 when a property fails, when the policy cannot be read or does not match the source, or when `--vault` is not a vault. A network error exits 4.

## prepare

`prepare` simulates every step before it shows anything to sign. It has three outcomes:

- **Handoff.** Every step simulates, and the output is what you sign: a signing link (with a QR code in a terminal), or with `--format cast` Foundry commands, or with `--format calls` `wallet_sendCalls` parameters. Exit 0.
- **Blocked.** A step fails in simulation. Nothing to sign is printed: no link, no QR code, no cast command. The output names the failing step and the reason. Exit 1.
- **Nothing to do.** The plan has no steps, so there is nothing to sign. The summary says "There is nothing to sign." Exit 0.

With `--format cast`, the commands use `$ETH_RPC_URL` when the deployment's RPC URL may hold an API key, so set it to your RPC URL. If no cast command can be printed, the command exits 1 instead of printing nothing. `--format json` is the same as `--json`.

`--web-url <url>` sets the web app that opens the signing link. It exists on the CLI only.

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

## Signing

`prepare` prints a signing link (and a QR code in a terminal) for the Atropyle web app, where you sign with OKX Wallet or another wallet. `--format cast` prints Foundry commands without a signer; `--format calls` prints `wallet_sendCalls` parameters. When a step fails simulation, nothing is printed to sign.

## License

MIT
