# Atropyle agent MCP client

A small MCP client that plans an Atropyle vault the way an AI agent does:

1. `atropyle_check_plan` checks the plan and the tokens on chain.
2. `atropyle_simulate` previews the timeline: when the alarm would go off and when the heirs would be paid.
3. `atropyle_prepare_create_vault` simulates the transactions and returns a signing link.

It never signs. Open the link in your own wallet, check each step there, then sign. The example prints the summary and every warning before the link. If a step fails simulation it prints why, prints no link and exits with a non-zero code.

## Run it against a local devnet

All commands run from the root of the repository.

```bash
npm install
npm run build && npm run build -w packages/mcp
npm run devnet
```

`npm run devnet` runs in its own terminal. It starts anvil on port 8545 and writes `deployments/local.json`. In another terminal:

```bash
node examples/agent-mcp-client/index.mjs --local --deployment deployments/local.json \
  --owner 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f \
  --heir 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC:60 \
  --heir 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc:40
```

`--local` runs the server built in this repository (`packages/mcp/dist/bin.js`). The addresses are public, unlocked anvil accounts (numbers 8, 2 and 5). The owner has no vault yet. Heirs are `address[:percent]`; without percents the shares are equal. The plan is a Drill: a practice vault that runs in minutes and expires after 7 days. Add `--real` for a vault with six-month timing.

## Run it against X Layer mainnet

Without `--local` the example starts the published server, `npx -y @atropyle/mcp@0.1.0`. With no `--deployment` that server reads X Layer mainnet, where the contracts are deployed. Add `--local` to run the server built in this repository instead; it reads X Layer mainnet too.

```bash
node examples/agent-mcp-client/index.mjs --owner 0xYourWallet --heir 0xHeirOne:70 --heir 0xHeirTwo:30
```

## Use the server in your agent

| Client         | File                                                       | Where it goes                                                                                           |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Claude Code    | [config/claude-code.mcp.json](config/claude-code.mcp.json) | `.mcp.json` at the root of your project, or run `claude mcp add atropyle -- npx -y @atropyle/mcp@0.1.0` |
| Claude Desktop | [config/claude-desktop.json](config/claude-desktop.json)   | merge into `claude_desktop_config.json`                                                                 |
| Cursor         | [config/cursor.mcp.json](config/cursor.mcp.json)           | `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json`                                             |

Each config pins `@atropyle/mcp@0.1.0` and sets no environment, so the server reads X Layer mainnet. To run the server from a checkout instead, set `command` to `node` and `args` to `["<absolute path to packages/mcp/dist/bin.js>"]`. To read another deployment, such as a local devnet, add `"--deployment", "<file>"` to `args`.

The Claude Code plugin of this repository bundles the same server with two Agent Skills:

```text
/plugin marketplace add duongnq2798/atropyle
/plugin install atropyle@atropyle
```

## Smoke test

```bash
npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli
(cd contracts && forge build)
npm run smoke -w examples/agent-mcp-client
```

The test starts its own anvil devnet (chain 31337) and plays the wallet: it sends each prepared step from an unlocked anvil account with `eth_sendTransaction`, then reads the vault back through `atropyle_get_vault`. It uses no private key.

## Safety

- The server prepares and simulates unsigned transactions. It has no tool that signs or sends.
- Text read from the chain, such as token names, is returned under `untrusted`. This example never prints it.
- Every guardian action carries the warning `GUARDIAN_VERIFY_OUT_OF_BAND`: confirm with the owner by phone or in person first.
